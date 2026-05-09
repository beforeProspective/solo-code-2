<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Tool;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ToolController extends Controller
{
    public function index(Request $request)
    {
        $query = Tool::with('owner');

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        if ($request->has('category')) {
            $query->where('category', $request->category);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $tools = $query->latest()->paginate(12);

        return response()->json($tools);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'required|string',
            'category' => 'required|string|max:255',
            'condition' => 'required|string',
            'image' => 'nullable|string',
        ]);

        $tool = Tool::create([
            'name' => $request->name,
            'description' => $request->description,
            'category' => $request->category,
            'condition' => $request->condition,
            'status' => 'available',
            'image' => $request->image,
            'owner_id' => Auth::id(),
        ]);

        return response()->json($tool->load('owner'), 201);
    }

    public function show(Tool $tool)
    {
        return response()->json($tool->load('owner', 'borrowings.borrower', 'damageReports.reporter'));
    }

    public function update(Request $request, Tool $tool)
    {
        if ($tool->owner_id !== Auth::id() && !Auth::user()->is_admin) {
            return response()->json(['message' => '无权操作'], 403);
        }

        $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'category' => 'sometimes|string|max:255',
            'condition' => 'sometimes|string',
            'status' => 'sometimes|string',
            'image' => 'nullable|string',
        ]);

        $tool->update($request->only(['name', 'description', 'category', 'condition', 'status', 'image']));

        return response()->json($tool->load('owner'));
    }

    public function destroy(Tool $tool)
    {
        if ($tool->owner_id !== Auth::id() && !Auth::user()->is_admin) {
            return response()->json(['message' => '无权操作'], 403);
        }

        $tool->delete();

        return response()->json(['message' => '工具已删除']);
    }

    public function myTools()
    {
        $tools = Tool::with('owner')->where('owner_id', Auth::id())->latest()->paginate(12);
        return response()->json($tools);
    }

    public function categories()
    {
        $categories = Tool::distinct()->pluck('category');
        return response()->json($categories);
    }
}
