#!/bin/bash
# Script to replace main.rs with the corrected version
cp main.rs main.rs.original_backup
cp main_new.rs main.rs
echo "File replaced successfully"