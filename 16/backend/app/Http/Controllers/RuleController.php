<?php

namespace App\Http\Controllers;

use App\Models\Rule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class RuleController extends Controller
{
    public function index()
    {
        return response()->json(
            Auth::user()->rules()->with('category')->orderBy('priority', 'desc')->get()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description_contains' => 'nullable|string',
            'min_amount' => 'nullable|numeric',
            'max_amount' => 'nullable|numeric',
            'amount_operator' => 'nullable|string',
            'category_id' => 'nullable|exists:categories,id',
            'tag_ids' => 'nullable|array',
            'tag_ids.*' => 'integer|exists:tags,id',
            'priority' => 'nullable|integer',
            'is_active' => 'boolean',
        ]);

        $validated['user_id'] = Auth::id();
        $rule = Rule::create($validated);
        $rule->load('category');
        return response()->json($rule, 201);
    }

    public function show(Rule $rule)
    {
        if ($rule->user_id !== Auth::id()) {
            abort(403);
        }
        $rule->load('category');
        return response()->json($rule);
    }

    public function update(Request $request, Rule $rule)
    {
        if ($rule->user_id !== Auth::id()) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description_contains' => 'nullable|string',
            'min_amount' => 'nullable|numeric',
            'max_amount' => 'nullable|numeric',
            'amount_operator' => 'nullable|string',
            'category_id' => 'nullable|exists:categories,id',
            'tag_ids' => 'nullable|array',
            'tag_ids.*' => 'integer|exists:tags,id',
            'priority' => 'nullable|integer',
            'is_active' => 'boolean',
        ]);

        $rule->update($validated);
        $rule->load('category');
        return response()->json($rule);
    }

    public function destroy(Rule $rule)
    {
        if ($rule->user_id !== Auth::id()) {
            abort(403);
        }
        $rule->delete();
        return response()->json(['message' => 'Rule deleted']);
    }
}
