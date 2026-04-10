#!/usr/bin/env bash
cd "$(dirname "$0")"
open "http://localhost:8000/index.html"
python3 -m http.server 8000
