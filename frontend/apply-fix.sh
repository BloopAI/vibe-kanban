#!/bin/bash

# Fix the OAuth API response handling in api.ts
sed -i '588s/return handleApiResponse<string>(response);/\/\/ Backend returns LoginResponse with token + user, extract just the token\
    const loginResponse = await handleApiResponse<{token: string, user: any}>(response);\
    return loginResponse.token;/' /home/namastex/workspace/automagik-forge/frontend/src/lib/api.ts

echo "Fix applied to api.ts"