

@app.route('/health', methods=['GET'])
def health_check():
    """API health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'reference_files': len(processed_features),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/reference-files', methods=['GET'])
def get_reference_files():
    """Get list of all reference files and their metadata"""
    try:
        files = []
        for filename in processed_features.keys():
            # Get basic file info
            file_path = os.path.join(request.json.get('directory', ''), filename)
            if os.path.exists(file_path):
                y, sr = librosa.load(file_path)
                duration = librosa.get_duration(y=y, sr=sr)
                files.append({
                    'filename': filename,
                    'duration': f"{duration:.2f}s",
                    'added_date': datetime.fromtimestamp(os.path.getctime(file_path)).isoformat()
                })
        
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload():
    """
    Enhanced initialization endpoint with more options
    """
    try:
        data = request.json
        directories = data.get('directories', [data.get('directory')])
        
        if not directories:
            return jsonify({'error': 'No directories provided'}), 400
            
        # Validate directories
        for directory in directories:
            if not os.path.isdir(directory):
                return jsonify({'error': f'Invalid directory path: {directory}'}), 400
        
        # Processing options
        options = {
            'n_mfcc': data.get('n_mfcc', 13),
            'normalize': data.get('normalize', True),
            'file_types': data.get('file_types', ['.ogg', '.wav', '.mp3'])
        }
            
        # Process all audio files in directories
        global processed_features
        processed_features = {}
        for directory in directories:
            features = get_all_audio_features(directory)
            processed_features.update(features)
        
        return jsonify({
            'message': 'Successfully processed reference files',
            'num_files': len(processed_features),
            'directories': directories
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    


@app.route('/batch-analyze', methods=['POST'])
def batch_analyze():
    """Analyze multiple files at once"""
    try:
        if not processed_features:
            return jsonify({'error': 'No reference files initialized'}), 400
            
        if 'audio_files' not in request.files:
            return jsonify({'error': 'No audio files provided'}), 400
            
        files = request.files.getlist('audio_files')
        if not files:
            return jsonify({'error': 'No files selected'}), 400
            
        results = []
        for file in files:
            # Process each file similarly to /analyze endpoint
            temp_file = tempfile.NamedTemporaryFile(delete=False)
            file.save(temp_file.name)
            
            features = load_audio_features(temp_file.name)
            os.unlink(temp_file.name)
            
            all_features = processed_features.copy()
            all_features[file.filename] = features
            
            rankings = rank_similar_files(file.filename, all_features)
            
            results.append({
                'filename': file.filename,
                'similar_files': rankings[:10]  # Top 10 matches
            })
            
        return jsonify({'results': results})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get system statistics"""
    try:
        return jsonify({
            'total_reference_files': len(processed_features),
            'feature_dimensions': next(iter(processed_features.values())).shape[0] if processed_features else 0,
            'last_initialized': datetime.fromtimestamp(
                os.path.getctime(request.json.get('directory', ''))
            ).isoformat() if processed_features else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/reference-files/<filename>', methods=['GET']) 
def get_reference_file_details(filename):
    """
    Get detailed information about a specific reference file
    Returns features, metadata, and similar files within the reference set
    """
    try:
        if filename not in processed_features:
            return jsonify({'error': 'File not found'}), 404
            
        file_path = os.path.join(request.json.get('directory', ''), filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on disk'}), 404
            
        # Get audio metadata
        y, sr = librosa.load(file_path)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Get similar files
        rankings = rank_similar_files(filename, processed_features)
        
        return jsonify({
            'filename': filename,
            'duration': f"{duration:.2f}s",
            'added_date': datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
            'features': processed_features[filename].tolist(),
            'similar_files': rankings[:10]  # Top 10 similar files
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/reference-files', methods=['POST'])
def add_reference_file():
    """
    Add a new file to the reference set
    Should trigger feature extraction and update the processed_features
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
            
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'No file selected'}), 400
            
        # Validate file
        valid, error = validate_audio_file(file)
        if not valid:
            return jsonify({'error': error}), 400
            
        # Save file temporarily and extract features
        temp_file = tempfile.NamedTemporaryFile(delete=False)
        file.save(temp_file.name)
        
        features = load_audio_features(temp_file.name)
        os.unlink(temp_file.name)
        
        # Add to processed features
        processed_features[file.filename] = features
        
        return jsonify({
            'message': 'File added successfully',
            'filename': file.filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/reference-files/<filename>', methods=['DELETE'])
def remove_reference_file(filename):
    """Remove a file from the reference set"""
    try:
        if filename not in processed_features:
            return jsonify({'error': 'File not found'}), 404
            
        del processed_features[filename]
        return jsonify({
            'message': 'File removed successfully',
            'filename': filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_mime_type(filename):
    """Detect mime type of file"""
    return mimetypes.guess_type(filename)[0] or 'application/octet-stream'

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        directory = 'path/to/your/files'
        file_path = os.path.join(directory, filename)
        
        # Validate file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
            
        # Get file size for progress tracking
        file_size = os.path.getsize(file_path)
        
        response = send_file(
            file_path,
            mimetype=get_mime_type(filename),
            as_attachment=True
        )
        
        # Add headers for better download handling
        response.headers['Content-Length'] = file_size
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Accept-Ranges'] = 'bytes'
        
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500
