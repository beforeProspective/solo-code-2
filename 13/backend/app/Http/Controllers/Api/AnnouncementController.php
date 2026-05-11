<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $query = Announcement::with('creator.employee')
            ->where(function ($q) use ($user) {
                $q->where('status', 'published')
                  ->orWhere(function ($q2) use ($user) {
                      if (in_array($user->role, ['admin', 'hr'])) {
                          $q2->whereIn('status', ['draft', 'published', 'archived']);
                      }
                  });
            });

        if ($request->has('type')) {
            $query->where('type', $request->type);
        }

        if ($request->has('is_pinned')) {
            $query->where('is_pinned', $request->is_pinned);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('content', 'like', "%{$search}%");
            });
        }

        $announcements = $query->orderBy('is_pinned', 'desc')
            ->orderBy('publish_date', 'desc')
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($announcements);
    }

    public function show($id)
    {
        $announcement = Announcement::with('creator.employee')
            ->findOrFail($id);

        return response()->json($announcement);
    }

    public function store(Request $request)
    {
        $this->authorizeRole(['admin', 'hr']);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'type' => 'required|in:general,policy,holiday,training,event,emergency,other',
            'target_audience' => 'nullable|string',
            'is_pinned' => 'nullable|boolean',
            'publish_date' => 'nullable|date',
            'expiry_date' => 'nullable|date|after:publish_date',
            'status' => 'nullable|in:draft,published,archived',
            'attachments' => 'nullable|array',
        ]);

        $validated['created_by'] = Auth::id();
        $validated['publish_date'] = $validated['publish_date'] ?? Carbon::now();

        $announcement = Announcement::create($validated);

        if ($announcement->status === 'published') {
            $this->notifyUsers($announcement);
        }

        return response()->json([
            'message' => '公告创建成功',
            'announcement' => $announcement,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $announcement = Announcement::findOrFail($id);
        $oldStatus = $announcement->status;

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'content' => 'sometimes|string',
            'type' => 'sometimes|in:general,policy,holiday,training,event,emergency,other',
            'target_audience' => 'nullable|string',
            'is_pinned' => 'nullable|boolean',
            'publish_date' => 'nullable|date',
            'expiry_date' => 'nullable|date|after:publish_date',
            'status' => 'sometimes|in:draft,published,archived',
            'attachments' => 'nullable|array',
        ]);

        $announcement->update($validated);

        if ($oldStatus !== 'published' && $announcement->status === 'published') {
            $this->notifyUsers($announcement);
        }

        return response()->json([
            'message' => '公告更新成功',
            'announcement' => $announcement,
        ]);
    }

    public function destroy($id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $announcement = Announcement::findOrFail($id);
        $announcement->delete();

        return response()->json([
            'message' => '公告已删除',
        ]);
    }

    protected function notifyUsers($announcement)
    {
        $users = User::all();
        $notifications = [];

        foreach ($users as $user) {
            $notifications[] = [
                'user_id' => $user->id,
                'title' => '新公告：' . $announcement->title,
                'message' => mb_substr($announcement->content, 0, 100) . '...',
                'type' => 'announcement',
                'action_url' => "/announcements/{$announcement->id}",
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ];
        }

        Notification::insert($notifications);
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
