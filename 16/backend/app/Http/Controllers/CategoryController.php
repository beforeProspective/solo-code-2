<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CategoryController extends Controller
{
    public function index()
    {
        return response()->json(Auth::user()->categories()->orderBy('type')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'required|string|in:income,expense',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

        $validated['user_id'] = Auth::id();
        $category = Category::create($validated);
        return response()->json($category, 201);
    }

    public function show(Category $category)
    {
        if ($category->user_id !== Auth::id()) {
            abort(403);
        }
        return response()->json($category);
    }

    public function update(Request $request, Category $category)
    {
        if ($category->user_id !== Auth::id() || $category->is_system) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => 'sometimes|string|in:income,expense',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

        $category->update($validated);
        return response()->json($category);
    }

    public function destroy(Category $category)
    {
        if ($category->user_id !== Auth::id() || $category->is_system) {
            abort(403);
        }
        $category->delete();
        return response()->json(['message' => 'Category deleted']);
    }
}
