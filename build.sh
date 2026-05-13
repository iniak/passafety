#!/bin/bash

echo "Building PasSafety..."

echo ""
echo "Step 1: Installing npm dependencies..."
npm install

echo ""
echo "Step 2: Building frontend..."
npm run build

echo ""
echo "Step 3: Building Tauri app..."
npm run tauri build

echo ""
echo "Build complete!"