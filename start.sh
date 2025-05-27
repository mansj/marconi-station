#!/bin/bash

# Start Python web server in the background
python3 -m http.server 8000 &
SERVER_PID=$!

# Open the browser
open http://localhost:8000

# Function to handle script termination
cleanup() {
    echo "Shutting down server..."
    kill $SERVER_PID
    exit 0
}

# Set up trap to catch termination signal
trap cleanup SIGINT SIGTERM

# Keep script running until terminated
wait 