<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\PerformanceReview;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class PerformanceReviewController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $query = PerformanceReview::with('user.employee', 'manager.employee');

        if ($user->role === 'employee') {
            $query->where('user_id', $user->id);
        } elseif ($user->role === 'manager') {
            $query->where(function ($q) use ($user) {
                $q->where('user_id', $user->id)
                  ->orWhere('manager_id', $user->id);
            });
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('review_period')) {
            $query->where('review_period', $request->review_period);
        }

        $reviews = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($reviews);
    }

    public function show($id)
    {
        $review = PerformanceReview::with('user.employee', 'manager.employee')
            ->findOrFail($id);

        return response()->json($review);
    }

    public function store(Request $request)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'manager_id' => 'required|exists:users,id',
            'review_period' => 'required|string',
            'review_date' => 'nullable|date',
            'goals' => 'nullable|array',
        ]);

        $review = PerformanceReview::create(array_merge($validated, [
            'status' => 'draft',
        ]));

        Notification::create([
            'user_id' => $validated['user_id'],
            'title' => '新绩效评估已创建',
            'message' => "您的{$validated['review_period']}绩效评估已创建，请及时完成自评",
            'type' => 'task',
            'action_url' => "/performance-reviews/{$review->id}",
        ]);

        return response()->json([
            'message' => '绩效评估创建成功',
            'review' => $review,
        ], 201);
    }

    public function submitSelfReview(Request $request, $id)
    {
        $review = PerformanceReview::findOrFail($id);
        $user = Auth::user();

        if ($review->user_id !== $user->id) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限执行此操作'],
            ])->status(403);
        }

        if (!in_array($review->status, ['draft', 'self_review'])) {
            return response()->json([
                'message' => '当前状态不允许提交自评',
            ], 400);
        }

        $validated = $request->validate([
            'self_assessment' => 'required|string',
            'self_rating' => 'required|numeric|min:0|max:5',
            'goals' => 'nullable|array',
            'submit' => 'nullable|boolean',
        ]);

        $status = $request->input('submit', true) ? 'manager_review' : 'self_review';

        $review->update(array_merge($validated, [
            'status' => $status,
            'submitted_at' => $request->input('submit', true) ? Carbon::now() : null,
        ]));

        if ($request->input('submit', true)) {
            Notification::create([
                'user_id' => $review->manager_id,
                'title' => '绩效自评待审批',
                'message' => $user->name . '已完成绩效自评，请及时评估',
                'type' => 'approval',
                'action_url' => "/performance-reviews/{$review->id}",
            ]);
        }

        return response()->json([
            'message' => $request->input('submit', true) ? '自评提交成功' : '自评保存成功',
            'review' => $review,
        ]);
    }

    public function submitManagerReview(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $review = PerformanceReview::findOrFail($id);

        if ($review->status !== 'manager_review') {
            return response()->json([
                'message' => '当前状态不允许经理评估',
            ], 400);
        }

        $validated = $request->validate([
            'manager_assessment' => 'required|string',
            'manager_rating' => 'required|numeric|min:0|max:5',
            'competencies' => 'nullable|array',
            'development_plan' => 'nullable|string',
            'overall_rating' => 'nullable|numeric|min:0|max:5',
            'finalize' => 'nullable|boolean',
        ]);

        $overallRating = $validated['overall_rating'] ?? ($validated['manager_rating']);
        $status = $request->input('finalize', true) ? 'completed' : 'manager_review';

        $review->update(array_merge($validated, [
            'overall_rating' => $overallRating,
            'status' => $status,
            'finalized_at' => $request->input('finalize', true) ? Carbon::now() : null,
        ]));

        if ($request->input('finalize', true)) {
            Notification::create([
                'user_id' => $review->user_id,
                'title' => '绩效评估已完成',
                'message' => '您的绩效评估已完成，请查看评估结果',
                'type' => 'info',
                'action_url' => "/performance-reviews/{$review->id}",
            ]);
        }

        return response()->json([
            'message' => $request->input('finalize', true) ? '绩效评估完成' : '经理评估保存成功',
            'review' => $review,
        ]);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $review = PerformanceReview::findOrFail($id);

        $validated = $request->validate([
            'review_period' => 'sometimes|string',
            'review_date' => 'nullable|date',
            'goals' => 'nullable|array',
            'status' => 'sometimes|in:draft,self_review,manager_review,completed,cancelled',
        ]);

        $review->update($validated);

        return response()->json([
            'message' => '绩效评估更新成功',
            'review' => $review,
        ]);
    }

    public function destroy($id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $review = PerformanceReview::findOrFail($id);
        $review->delete();

        return response()->json([
            'message' => '绩效评估已删除',
        ]);
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
