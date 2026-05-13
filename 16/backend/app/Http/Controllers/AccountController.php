<?php

namespace App\Http\Controllers;

use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AccountController extends Controller
{
    public function index()
    {
        return response()->json(Auth::user()->accounts()->orderBy('created_at', 'desc')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'required|string',
            'currency' => 'required|string|max:3',
            'balance' => 'required|numeric',
            'color' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $account = Auth::user()->accounts()->create($validated);
        return response()->json($account, 201);
    }

    public function show(Account $account)
    {
        if ($account->user_id !== Auth::id()) {
            abort(403);
        }
        return response()->json($account);
    }

    public function update(Request $request, Account $account)
    {
        if ($account->user_id !== Auth::id()) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => 'sometimes|string',
            'currency' => 'sometimes|string|max:3',
            'balance' => 'sometimes|numeric',
            'color' => 'nullable|string',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $account->update($validated);
        return response()->json($account);
    }

    public function destroy(Account $account)
    {
        if ($account->user_id !== Auth::id()) {
            abort(403);
        }
        $account->delete();
        return response()->json(['message' => 'Account deleted']);
    }
}
