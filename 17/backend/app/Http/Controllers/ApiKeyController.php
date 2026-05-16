<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\ApiKey;

class ApiKeyController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->auth->sub;
        $keys = ApiKey::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($keys);
    }

    public function store(Request $request)
    {
        $this->validate($request, [
            'name' => 'required|string|max:255',
            'limit' => 'nullable|integer|min:1',
        ]);

        $apiKey = 'sk_' . bin2hex(random_bytes(32));

        $key = ApiKey::create([
            'user_id' => $request->auth->sub,
            'name' => $request->name,
            'key' => $apiKey,
            'limit' => $request->limit,
            'active' => true,
        ]);

        return response()->json([
            'message' => 'API key created successfully',
            'key' => $key,
        ], 201);
    }

    public function destroy(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $key = ApiKey::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $key->delete();

        return response()->json([
            'message' => 'API key deleted successfully',
        ]);
    }
}
