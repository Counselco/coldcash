#!/usr/bin/env bash
# Test git credential fill with various inputs

echo "Test 1: Basic protocol/host"
echo -e "protocol=https\nhost=github.com\n" | git credential fill 2>&1 | head -10

echo ""
echo "Test 2: With URL"
echo -e "url=https://github.com\n" | git credential fill 2>&1 | head -10

echo ""
echo "Test 3: With username"
echo -e "protocol=https\nhost=github.com\nusername=josephrsanchez@gmail.com\n" | git credential fill 2>&1 | head -10
