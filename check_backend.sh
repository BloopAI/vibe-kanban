#!/bin/bash

echo "Checking backend for compilation issues..."

# Check if rust is installed
if ! command -v rustc &> /dev/null; then
    echo "ERROR: Rust is not installed. Please install Rust first."
    echo "Visit: https://rustup.rs/"
    exit 1
fi

# Navigate to backend directory
cd backend || exit 1

# Try to compile
echo "Running cargo check..."
cargo check 2>&1 | tee ../backend_errors.log

echo ""
echo "Compilation output saved to backend_errors.log"
echo ""

# Check for specific errors
if grep -q "error" ../backend_errors.log; then
    echo "Found compilation errors:"
    grep -A 2 -B 2 "error" ../backend_errors.log
else
    echo "No compilation errors found."
fi