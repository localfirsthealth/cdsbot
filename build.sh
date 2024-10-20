#!/bin/bash

set -e

# Set variables
PROJECT_NAME="cdsbot"
VERSION="1.2.3"  # Replace with your actual version number
PLATFORM="macos"
ARCH="amd64"
SRC_FILE="src/server.js"
BINS_DIR="./bins"
TEMP_DIR=$(mktemp -d)

# Ensure the bins directory exists
mkdir -p "$BINS_DIR"

# Function to clean up temporary directory
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "Error: Deno is not installed. Please install Deno and try again."
    exit 1
fi


# Compile the Deno project
echo "Compiling $PROJECT_NAME..."
deno compile -A --target x86_64-apple-darwin --output "$TEMP_DIR/$PROJECT_NAME" "$SRC_FILE"

# Check if compilation was successful
if [ ! -f "$TEMP_DIR/$PROJECT_NAME" ]; then
    echo "Error: Compilation failed. Binary not found."
    exit 1
fi

# Delete existing binary directory
echo "Deleting existing binary directory..."
rm -rf "$BINS_DIR"
mkdir -p "$BINS_DIR"

# Create the output filename
OUTPUT_FILE="${BINS_DIR}/${PROJECT_NAME}_${PLATFORM}_${ARCH}_${VERSION}.tgz"

# Compress the binary
echo "Compressing binary..."
tar czf "$OUTPUT_FILE" -C "$TEMP_DIR" "$PROJECT_NAME"

# Generate SHA256 hash
echo "Generating SHA256 hash..."
shasum -a 256 "$OUTPUT_FILE" > "${OUTPUT_FILE}.sha256"

# Print results
echo "Build completed successfully."
echo "Compressed file created: $OUTPUT_FILE"
echo "SHA256 hash file created: ${OUTPUT_FILE}.sha256"

# Display the contents of the bins directory
echo "Contents of $BINS_DIR:"
ls -l "$BINS_DIR"
