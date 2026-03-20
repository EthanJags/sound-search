import os
import sys
import librosa
import numpy as np
from scipy.spatial.distance import cdist

def load_audio_features(file_path, n_mfcc=13):
    """
    Load an audio file and extract MFCC features.
    """
    y, sr = librosa.load(file_path, sr=None)
    # Extract MFCC features
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    # Compute the mean of the MFCCs over time
    mfcc_mean = np.mean(mfcc.T, axis=0)
    return mfcc_mean

def get_all_audio_features(directory, n_mfcc=13):
    """
    Load all .adg.ogg files in the directory and extract their MFCC features.
    """
    audio_features = {}
    for filename in os.listdir(directory):
        if filename.endswith('.adg.ogg'):
            file_path = os.path.join(directory, filename)
            print(f"Processing {filename}...")
            features = load_audio_features(file_path, n_mfcc)
            audio_features[filename] = features
    return audio_features

def rank_similar_files(input_filename, audio_features):
    """
    Rank files based on similarity to the input file.
    """
    input_features = audio_features[input_filename]
    other_files = {k: v for k, v in audio_features.items() if k != input_filename}

    # Compute cosine distances
    distances = {}
    for filename, features in other_files.items():
        # Compute cosine distance
        distance = cdist([input_features], [features], metric='cosine')[0][0]
        distances[filename] = distance

    # Sort files based on distance (lower distance = more similar)
    ranked_files = sorted(distances.items(), key=lambda x: x[1])
    return ranked_files

def main():
    if len(sys.argv) != 3:
        print("Usage: python audio_similarity.py <input_file.adg.ogg> <musicML_directory>")
        sys.exit(1)

    input_filename = sys.argv[1]
    musicml_directory = sys.argv[2]

    # Ensure the input file exists in the directory
    if not os.path.isfile(os.path.join(musicml_directory, input_filename)):
        print(f"Input file {input_filename} not found in {musicml_directory}")
        sys.exit(1)

    # Load features for all audio files
    audio_features = get_all_audio_features(musicml_directory)

    # Check if the input file's features were loaded
    if input_filename not in audio_features:
        print(f"Could not load features for {input_filename}")
        sys.exit(1)

    # Rank similar files
    ranked_files = rank_similar_files(input_filename, audio_features)

    # Display the results
    print(f"\nFiles similar to {input_filename}:")
    for rank, (filename, distance) in enumerate(ranked_files, start=1):
        print(f"{rank}. {filename} (Similarity Score: {1 - distance:.4f})")


if __name__ == "__main__":
    main()