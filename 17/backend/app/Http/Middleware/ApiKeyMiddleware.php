<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\ApiKey;

class ApiKeyMiddleware
{
    public function handle($request, Closure $next)
    {
        $apiKey = $request->header('X-API-Key');
        
        if (!$apiKey) {
            return response()->json([
                'error' => 'API key not provided'
            ], 401);
        }

        $key = ApiKey::where('key', $apiKey)->where('active', true)->first();

        if (!$key) {
            return response()->json([
                'error' => 'Invalid API key'
            ], 401);
        }

        $request->apiKey = $key;
        $request->user = $key->user;

        return $next($request);
    }
}
