#!/bin/bash

# Check if a query is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <query>"
    exit 1
fi

QUERY="$*" # Capture all arguments as the query

# Function to URL-encode the query using python3
urlencode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote_plus(sys.argv[1]))' "$1"
}

ENCODED_QUERY=$(urlencode "$QUERY")
API_URL="https://api.duckduckgo.com/?q=${ENCODED_QUERY}&format=json&pretty=1&nohtml=1&skip_disambig=1"
USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Retry logic
MAX_RETRIES=3
RETRY_DELAY=2
response=""
success=0

for ((i=1; i<=MAX_RETRIES; i++)); do
    # Fetch with timeout (10s) and user-agent
    if response=$(curl -s --max-time 10 -A "$USER_AGENT" "$API_URL"); then
        # Check if response looks like valid JSON (starts with {)
        if [[ "$response" == \{* ]]; then
            success=1
            break
        fi
    fi
    
    # Log to stderr to avoid polluting output
    if [ $i -lt $MAX_RETRIES ]; then
        echo "DEBUG: DDG Fetch attempt $i failed or returned invalid data. Retrying in ${RETRY_DELAY}s..." >&2
        sleep "$RETRY_DELAY"
    fi
done

if [ $success -eq 0 ]; then
    echo "Error: Failed to connect to DuckDuckGo API after $MAX_RETRIES attempts."
    exit 1
fi

# Extract AbstractText, AbstractURL, or Redirect
abstract_text=$(echo "$response" | jq -r '.AbstractText // empty')
abstract_url=$(echo "$response" | jq -r '.AbstractURL // empty')
redirect_url=$(echo "$response" | jq -r '.Redirect // empty')

output=""

if [ -n "$abstract_text" ]; then
    output="$abstract_text"
    if [ -n "$abstract_url" ]; then
        output="$output\nURL: $abstract_url"
    fi
elif [ -n "$redirect_url" ]; then
    output="Redirect: $redirect_url"
else
    # If no abstract or redirect, try to get related topics
    related_topics=$(echo "$response" | jq -r '.RelatedTopics[] | select(.Text != null and .Text != "") | .Text' | head -n 3)
    if [ -n "$related_topics" ]; then
        output="Related Topics:\n$related_topics"
    else
        output="No direct answer or related topics found (API limitation)."
    fi
fi

echo -e "$output"