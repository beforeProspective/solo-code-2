<?php

namespace App\Http\Controllers;

use App\Models\Tag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TagController extends Controller
{
    public function index()
    {
        return response()->json(Auth::user()->tags()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'color' => 'nullable|string',
        ]);

        $validated['user_id'] = Auth::id();
        $tag = Tag::create($validated);
        return response()->json($tag, 201);
    }

    public function show(Tag $tag)
    {
        if ($tag->user_id !== Auth::id()) {
            abort(403);
        }
        return response()->json($tag);
    }

    public function update(Request $request, Tag $tag)
    {
        if ($tag->user_id !== Auth::id()) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'color' => 'nullable|string',
        ]);

        $tag->update($validated);
        return response()->json($tag);
    }

    public function destroy(Tag $tag)
    {
        if ($tag->user_id !== Auth::id()) {
            abort(403);
        }
        $tag->delete();
        return response()->json(['message' => 'Tag deleted']);
    }
}
