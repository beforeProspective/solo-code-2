<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class DocumentController extends Controller
{
    public function categories()
    {
        $categories = DocumentCategory::withCount('documents')->get();

        return response()->json($categories);
    }

    public function storeCategory(Request $request)
    {
        $this->authorizeRole(['admin', 'hr']);

        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:document_categories',
            'description' => 'nullable|string',
        ]);

        $category = DocumentCategory::create($validated);

        return response()->json([
            'message' => '文档分类创建成功',
            'category' => $category,
        ], 201);
    }

    public function index(Request $request)
    {
        $user = Auth::user();
        $query = Document::with('category', 'user.employee', 'creator.employee');

        if ($user->role === 'employee') {
            $query->where(function ($q) use ($user) {
                $q->where('visibility', 'public')
                  ->orWhere('user_id', $user->id)
                  ->orWhere('created_by', $user->id);
            });
        }

        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->has('visibility')) {
            $query->where('visibility', $request->visibility);
        }

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $documents = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($documents);
    }

    public function show($id)
    {
        $user = Auth::user();
        $document = Document::findOrFail($id);

        if ($document->visibility === 'private' &&
            $document->user_id !== $user->id &&
            $document->created_by !== $user->id &&
            !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限查看此文档'],
            ])->status(403);
        }

        return response()->json($document);
    }

    public function upload(Request $request)
    {
        $validated = $request->validate([
            'file' => 'required|file|max:102400',
            'category_id' => 'nullable|exists:document_categories,id',
            'description' => 'nullable|string',
            'user_id' => 'nullable|exists:users,id',
            'visibility' => 'nullable|in:public,private',
        ]);

        $file = $request->file('file');
        $path = $file->store('documents', 'public');
        $fileName = $file->getClientOriginalName();

        $document = Document::create([
            'name' => $fileName,
            'path' => $path,
            'type' => $this->getFileType($file->extension()),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'description' => $validated['description'] ?? null,
            'user_id' => $validated['user_id'] ?? Auth::id(),
            'category_id' => $validated['category_id'] ?? null,
            'visibility' => $validated['visibility'] ?? 'private',
            'created_by' => Auth::id(),
        ]);

        return response()->json([
            'message' => '文件上传成功',
            'document' => $document,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $user = Auth::user();
        $document = Document::findOrFail($id);

        if ($document->created_by !== $user->id && !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限修改此文档'],
            ])->status(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'category_id' => 'nullable|exists:document_categories,id',
            'visibility' => 'sometimes|in:public,private',
        ]);

        $document->update($validated);

        return response()->json([
            'message' => '文档信息更新成功',
            'document' => $document,
        ]);
    }

    public function download($id)
    {
        $user = Auth::user();
        $document = Document::findOrFail($id);

        if ($document->visibility === 'private' &&
            $document->user_id !== $user->id &&
            $document->created_by !== $user->id &&
            !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限下载此文档'],
            ])->status(403);
        }

        return Storage::disk('public')->download($document->path, $document->name);
    }

    public function destroy($id)
    {
        $user = Auth::user();
        $document = Document::findOrFail($id);

        if ($document->created_by !== $user->id && !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限删除此文档'],
            ])->status(403);
        }

        Storage::disk('public')->delete($document->path);
        $document->delete();

        return response()->json([
            'message' => '文档已删除',
        ]);
    }

    protected function getFileType($extension)
    {
        $types = [
            'pdf' => 'pdf',
            'doc' => 'document', 'docx' => 'document',
            'xls' => 'spreadsheet', 'xlsx' => 'spreadsheet',
            'ppt' => 'presentation', 'pptx' => 'presentation',
            'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'gif' => 'image',
            'txt' => 'text',
            'zip' => 'archive', 'rar' => 'archive',
        ];

        return $types[strtolower($extension)] ?? 'other';
    }

    protected function authorizeRole($roles)
    {
        $user = Auth::user();
        if (!in_array($user->role, $roles)) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限执行此操作'],
            ])->status(403);
        }
    }
}
