<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use App\Models\User;
use Exception;

class AuthController extends Controller
{
    protected function jwt($user)
    {
        $payload = [
            'iss' => env('APP_URL', 'http://localhost:8001'),
            'sub' => $user->id,
            'iat' => time(),
            'exp' => time() + (env('JWT_TTL', 60) * 60),
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ]
        ];

        return JWT::encode($payload, env('JWT_SECRET'), 'HS256');
    }

    public function register(Request $request)
    {
        $this->validate($request, [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => 'user',
        ]);

        $token = $this->jwt($user);

        return response()->json([
            'message' => 'User registered successfully',
            'token' => $token,
            'user' => $user,
        ], 201);
    }

    public function login(Request $request)
    {
        $this->validate($request, [
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json([
                'error' => 'Invalid credentials'
            ], 401);
        }

        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'error' => 'Invalid credentials'
            ], 401);
        }

        if (!$user->active) {
            return response()->json([
                'error' => 'Account is disabled'
            ], 403);
        }

        $token = $this->jwt($user);

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $user,
        ]);
    }

    public function me(Request $request)
    {
        $user = User::find($request->auth->sub);
        return response()->json($user);
    }

    public function refresh(Request $request)
    {
        $token = str_replace('Bearer ', '', $request->header('Authorization'));
        
        try {
            $decoded = JWT::decode($token, new Key(env('JWT_SECRET'), 'HS256'));
            $user = User::find($decoded->sub);
            
            if (!$user) {
                return response()->json(['error' => 'User not found'], 404);
            }
            
            $newToken = $this->jwt($user);
            
            return response()->json([
                'token' => $newToken,
                'user' => $user,
            ]);
        } catch (Exception $e) {
            return response()->json(['error' => 'Invalid token'], 401);
        }
    }

    public function logout(Request $request)
    {
        return response()->json([
            'message' => 'Successfully logged out'
        ]);
    }
}
