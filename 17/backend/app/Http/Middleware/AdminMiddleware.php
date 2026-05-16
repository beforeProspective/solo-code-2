<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\User;

class AdminMiddleware
{
    public function handle($request, Closure $next)
    {
        $userId = $request->auth->sub;
        $user = User::find($userId);

        if (!$user || $user->role !== 'admin') {
            return response()->json([
                'error' => 'Admin access required'
            ], 403);
        }

        return $next($request);
    }
}
