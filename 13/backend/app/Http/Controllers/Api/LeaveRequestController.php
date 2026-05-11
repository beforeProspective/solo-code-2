<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeaveRequest;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class LeaveRequestController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $query = LeaveRequest::with('user.employee', 'approver.employee');

        if ($user->role === 'employee') {
            $query->where('user_id', $user->id);
        } elseif ($user->role === 'manager') {
            $query->where(function ($q) use ($user) {
                $q->where('user_id', $user->id)
                  ->orWhere('approver_id', $user->id);
            });
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('leave_type')) {
            $query->where('leave_type', $request->leave_type);
        }

        $leaveRequests = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($leaveRequests);
    }

    public function show($id)
    {
        $leaveRequest = LeaveRequest::with('user.employee', 'approver.employee')
            ->findOrFail($id);

        return response()->json($leaveRequest);
    }

    public function store(Request $request)
    {
        $user = Auth::user();

        $validated = $request->validate([
            'leave_type' => 'required|in:annual,sick,personal,maternity,paternity,unpaid,other',
            'start_date' => 'required|date|after_or_equal:today',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'required|string',
            'approver_id' => 'required|exists:users,id',
        ]);

        $startDate = Carbon::parse($validated['start_date']);
        $endDate = Carbon::parse($validated['end_date']);
        $totalDays = $startDate->diffInWeekdays($endDate) + 1;

        $leaveRequest = LeaveRequest::create(array_merge($validated, [
            'user_id' => $user->id,
            'total_days' => $totalDays,
            'status' => 'pending',
        ]));

        Notification::create([
            'user_id' => $validated['approver_id'],
            'title' => '请假申请待审批',
            'message' => "{$user->name}提交了新的请假申请，共{$totalDays}天",
            'type' => 'approval',
            'action_url' => "/leave-requests/{$leaveRequest->id}",
        ]);

        return response()->json([
            'message' => '请假申请提交成功',
            'leave_request' => $leaveRequest->load('user.employee'),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $leaveRequest = LeaveRequest::findOrFail($id);
        $user = Auth::user();

        if ($leaveRequest->user_id !== $user->id && !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限修改此申请'],
            ])->status(403);
        }

        if ($leaveRequest->status !== 'pending') {
            return response()->json([
                'message' => '只能修改待审批的申请',
            ], 400);
        }

        $validated = $request->validate([
            'leave_type' => 'sometimes|in:annual,sick,personal,maternity,paternity,unpaid,other',
            'start_date' => 'sometimes|date',
            'end_date' => 'sometimes|date|after_or_equal:start_date',
            'reason' => 'sometimes|string',
        ]);

        if (isset($validated['start_date']) || isset($validated['end_date'])) {
            $startDate = Carbon::parse($validated['start_date'] ?? $leaveRequest->start_date);
            $endDate = Carbon::parse($validated['end_date'] ?? $leaveRequest->end_date);
            $validated['total_days'] = $startDate->diffInWeekdays($endDate) + 1;
        }

        $leaveRequest->update($validated);

        return response()->json([
            'message' => '请假申请更新成功',
            'leave_request' => $leaveRequest,
        ]);
    }

    public function approve(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $leaveRequest = LeaveRequest::findOrFail($id);

        if ($leaveRequest->status !== 'pending') {
            return response()->json([
                'message' => '只能审批待审批的申请',
            ], 400);
        }

        $validated = $request->validate([
            'approver_comment' => 'nullable|string',
        ]);

        $leaveRequest->update(array_merge($validated, [
            'status' => 'approved',
            'approver_id' => Auth::id(),
            'approved_at' => Carbon::now(),
        ]));

        Notification::create([
            'user_id' => $leaveRequest->user_id,
            'title' => '请假申请已批准',
            'message' => '您的请假申请已被批准',
            'type' => 'info',
            'action_url' => "/leave-requests/{$leaveRequest->id}",
        ]);

        return response()->json([
            'message' => '请假申请已批准',
            'leave_request' => $leaveRequest,
        ]);
    }

    public function reject(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $leaveRequest = LeaveRequest::findOrFail($id);

        if ($leaveRequest->status !== 'pending') {
            return response()->json([
                'message' => '只能审批待审批的申请',
            ], 400);
        }

        $validated = $request->validate([
            'approver_comment' => 'required|string',
        ]);

        $leaveRequest->update(array_merge($validated, [
            'status' => 'rejected',
            'approver_id' => Auth::id(),
        ]));

        Notification::create([
            'user_id' => $leaveRequest->user_id,
            'title' => '请假申请被拒绝',
            'message' => '您的请假申请已被拒绝',
            'type' => 'warning',
            'action_url' => "/leave-requests/{$leaveRequest->id}",
        ]);

        return response()->json([
            'message' => '请假申请已拒绝',
            'leave_request' => $leaveRequest,
        ]);
    }

    public function destroy($id)
    {
        $leaveRequest = LeaveRequest::findOrFail($id);
        $user = Auth::user();

        if ($leaveRequest->user_id !== $user->id && !in_array($user->role, ['admin', 'hr'])) {
            throw ValidationException::withMessages([
                'permission' => ['您没有权限删除此申请'],
            ])->status(403);
        }

        if ($leaveRequest->status !== 'pending') {
            return response()->json([
                'message' => '只能删除待审批的申请',
            ], 400);
        }

        $leaveRequest->delete();

        return response()->json([
            'message' => '请假申请已撤回',
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
