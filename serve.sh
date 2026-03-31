#!/bin/bash
# Serve Arjun's Knowledge Base locally
cd "$(dirname "$0")"
echo "Serving KB at http://localhost:8080"
python3 -m http.server 8080
