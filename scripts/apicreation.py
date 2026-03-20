from flask import Flask, request, jsonify, send_file, send_from_directory
import soundfile as sf
import io
import base64
import os
import tempfile
import librosa
import numpy as np
import json
from datetime import datetime
from scipy.spatial.distance import cdist
from main import load_audio_features, get_all_audio_features, rank_similar_files
from pymongo import MongoClient
from flask_cors import CORS, cross_origin
import zipfile
from bson.objectid import ObjectId
import gridfs
import mimetypes
from pinecone import Pinecone, ServerlessSpec
import urllib.parse
import boto3

# AWS S3
aws_access_key_id='AKIAX5573J5D2IWNTDJY'
aws_secret_access_key='zL5Vvkyl2pt4NDt9NNEM8GVR0O0xg1dc8ZhK2esc'
# create an instance of the client connection to your aws
s3_client = boto3.client('s3', aws_access_key_id=aws_access_key_id, aws_secret_access_key=aws_secret_access_key )

# MongoDB
url = os.getenv('MONGODB_URI')
print("url", url)
client = MongoClient(url)
db = client['soundDB']

# Flask
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
CORS(app)

# Pinecone
pc = Pinecone(api_key="pcsk_2XKZvc_J9oCdGJwcvGN139MsHiKkPFp1TugQhRpy69Zyp9ZXcJbs8mnb9LrfXH3Ri8Hayh")
index_name = "music-ai"
index = pc.Index(index_name)

# Store processed features globally
processed_features = {}

def validate_audio_file(file):
    """Validate uploaded audio file"""
    print(f"File received: {file.filename}, MIME type: {file.content_type}, Size: {len(file.read())}")

    # Check file size (e.g., max 10MB)
    if len(file.read()) > 10 * 1024 * 1024:
        return False, "File too large"
    file.seek(0)  # Reset file pointer
    
    # Check file extension
    allowed_extensions = {'.ogg', '.wav', '.mp3'}
    if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
        return False, "Invalid file format"
    
    return True, None

@app.route('/search', methods=['POST'])
def search():
    """
    Search for similar sounds and return both rankings and files
    """
    temp_files = []  # Keep track of temp files to clean up

    try:
        # Validate that a file was uploaded
        print("request.files", request.files)
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
            
        file = request.files['audio_file']

        valid, error = validate_audio_file(file)
        if not valid:
            print("file not valid")
            return jsonify({'error': error}), 400

        # Process uploaded file
        print("processing file")
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_files.append(temp_file.name)
            file.save(temp_file.name)
            reference_features = load_audio_features(temp_file.name)

        # Get all sounds from MongoDB
        sounds = db.demo_sounds.find()
        print("Retrieved sounds from MongoDB")
        print("sounds", sounds)
        # Extract features and filenames
        all_features = {}
        sound_titles = {}
        for i, sound in enumerate(sounds):
            embedding = sound['embedding']
            filename = sound['title']
            all_features[filename] = np.array(embedding)
            sound_titles[filename] = filename
        print(f"Extracted features and titles for {len(all_features)} sounds")
            
        if not all_features:
            print("No sounds found in database")
            return jsonify({'error': 'No sounds found in database'}), 400
        
        # Add reference file features
        reference_filename = file.filename
        all_features[reference_filename] = reference_features
        
        # Get rankings
        rankings = rank_similar_files(reference_filename, all_features)
        print(f"Generated rankings for {len(rankings)} files")
        
        # Format results with just rankings first
        ranked_sounds = []
        for filename, similarity in rankings:
            sound = db.demo_sounds.find_one({'title': filename})
            if sound:
                ranked_sounds.append({
                    'filename': filename,
                    'similarity': 1 - similarity,
                    'file_id': str(sound['file_id'])
                })

        # Return just the rankings if there's an issue with file creation
        if not ranked_sounds:
            return jsonify({'error': 'No matches found'}), 404

        try:
            # Create a ZIP file containing all ranked files
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_zip:
                temp_files.append(temp_zip.name)
                with zipfile.ZipFile(temp_zip.name, 'w') as zf:
                    fs = gridfs.GridFS(db)
                    
                    for sound in ranked_sounds:
                        try:
                            audio_file = fs.get(ObjectId(sound['file_id']))
                            if audio_file:
                                zf.writestr(sound['filename'], audio_file.read())
                        except Exception as e:
                            print(f"Error adding file {sound['filename']}: {str(e)}")
                            continue

                    zf.writestr('rankings.json', json.dumps({'ranked_sounds': ranked_sounds}))

                # Send response
                response = send_file(
                    temp_zip.name,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name='search_results.zip'
                )

                # Add rankings to header
                rankings_json = base64.b64encode(json.dumps({'ranked_sounds': ranked_sounds}).encode()).decode()
                response.headers['X-Rankings-Data'] = rankings_json
                response.headers['Access-Control-Expose-Headers'] = 'X-Rankings-Data'

                # Clean up temp files after response is sent
                @response.call_on_close
                def cleanup():
                    for temp_file in temp_files:
                        try:
                            if os.path.exists(temp_file):
                                os.unlink(temp_file)
                        except Exception as e:
                            print(f"Error cleaning up temp file {temp_file}: {str(e)}")

                return response

        except Exception as e:
            print(f"Error creating ZIP file: {str(e)}")
            # If ZIP creation fails, at least return the rankings
            return jsonify({'ranked_sounds': ranked_sounds})

    except Exception as e:
        # Clean up temp files if there's an error THIS MIGHT NEED TO BE REMOVED FROM HERE *****
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as cleanup_error:
                print(f"Error cleaning up temp file {temp_file}: {str(cleanup_error)}")
        # TO HERE *****
        print(f"Error in search endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500




@app.route('/searchPinecone', methods=['POST'])
def searchPinecone():
    """
    Search for similar sounds and return both rankings and files
    """
    # Validate that a file was uploaded
    print("request.files", request.files)
    if 'audio_file' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    # get the audio file from the request
    file = request.files['audio_file']
    
    # validate the audio file
    valid, error = validate_audio_file(file)
    if not valid:
        print("file not valid")
        return jsonify({'error': error}), 400
    
    # convert the query to a vector
    query_vector = load_audio_features('./user_input.ogg').tolist()

    # search the index
    results = index.query(
        vector=query_vector,
        top_k=100,
        include_metadata=True)
    
    # Convert QueryResponse to a serializable dictionary
    response_dict = {
        "matches": [
            {
                "id": match["id"],
                "score": match["score"],
                "metadata": match.get("metadata", {})
            }
            for match in results.get("matches", [])
        ]
    }

    # return the results as a JSON response
    return jsonify(response_dict)

def get_audio_from_s3(filepath):
    """
    Fetch audio from S3 bucket
    """
    try:
        response = s3_client.get_object(Bucket='soundsearch', Key=filepath)
    except s3_client.exceptions.NoSuchKey:
        print(f"Error: File {filepath} not found in S3 bucket")
        raise FileNotFoundError(f"Audio file {filepath} not found")
    except Exception as e:
        print(f"Error retrieving {filepath} from S3: {str(e)}")
        raise
    audio_blob = response['Body'].read()
    return audio_blob

@app.route('/fetch_audio', methods=['GET'])
@cross_origin()
def fetch_audio():
    """
    Fetch audio from S3 bucket, according to array of filenames
    """
    encoded_filepaths = request.args.get('filepaths')
    filepaths = urllib.parse.unquote(encoded_filepaths).split(',')
    filepaths = [filepath.lstrip('./') for filepath in filepaths]
    print("filepaths", filepaths)
    audio_blobs = []
    for filepath in filepaths:
        audio_blob = get_audio_from_s3(filepath)
        encoded_audio = base64.b64encode(audio_blob).decode('utf-8')
        audio_blobs.append({'filename': filepath, 'data': encoded_audio})
    return jsonify(audio_blobs)

if __name__ == '__main__':
    app.run(host='localhost', port=3002, debug=True)