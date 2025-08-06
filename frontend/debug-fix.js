// Quick debug fix for OAuth issue
// The problem is in multiuserAuthApi.poll() - it expects string but gets LoginResponse object

// In /frontend/src/lib/api.ts line 588, change:
// return handleApiResponse<string>(response);
// to:
// const loginResponse = await handleApiResponse<{token: string, user: any}>(response);
// return loginResponse.token;

console.log('OAuth debugging fix identified: API response type mismatch');
console.log('Backend returns {token, user} but frontend expects just string token');
console.log('Apply the fix to /frontend/src/lib/api.ts line 588');