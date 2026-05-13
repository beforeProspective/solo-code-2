<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:6|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        $token = Auth::login($user);

        $this->seedDefaultData($user);

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        if (!$token = Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        return $this->respondWithToken($token);
    }

    public function me()
    {
        return response()->json(Auth::user());
    }

    public function logout()
    {
        Auth::logout();
        return response()->json(['message' => 'Successfully logged out']);
    }

    public function refresh()
    {
        return $this->respondWithToken(Auth::refresh());
    }

    protected function respondWithToken($token)
    {
        return response()->json([
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => Auth::factory()->getTTL() * 60,
            'user' => Auth::user(),
        ]);
    }

    protected function seedDefaultData($user)
    {
        $categories = [
            ['name' => '餐饮', 'type' => 'expense', 'color' => '#ef4444'],
            ['name' => '交通', 'type' => 'expense', 'color' => '#f97316'],
            ['name' => '购物', 'type' => 'expense', 'color' => '#eab308'],
            ['name' => '娱乐', 'type' => 'expense', 'color' => '#22c55e'],
            ['name' => '医疗', 'type' => 'expense', 'color' => '#3b82f6'],
            ['name' => '教育', 'type' => 'expense', 'color' => '#8b5cf6'],
            ['name' => '住房', 'type' => 'expense', 'color' => '#ec4899'],
            ['name' => '工资', 'type' => 'income', 'color' => '#10b981'],
            ['name' => '投资', 'type' => 'income', 'color' => '#06b6d4'],
            ['name' => '其他收入', 'type' => 'income', 'color' => '#6366f1'],
        ];

        foreach ($categories as $category) {
            $user->categories()->create([
                'name' => $category['name'],
                'type' => $category['type'],
                'color' => $category['color'],
                'is_system' => true,
            ]);
        }

        $tags = ['必要开支', '可选开支', '紧急', '工作相关', '家庭'];
        foreach ($tags as $tag) {
            $user->tags()->create(['name' => $tag]);
        }
    }
}
