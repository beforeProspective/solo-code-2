<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $query = Attendance::with('user.employee');

        if ($user->role === 'employee') {
            $query->where('user_id', $user->id);
        } elseif ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('date', [$request->start_date, $request->end_date]);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $attendances = $query->orderBy('date', 'desc')->paginate($request->get('per_page', 30));

        return response()->json($attendances);
    }

    public function show($id)
    {
        $attendance = Attendance::with('user.employee')->findOrFail($id);

        return response()->json($attendance);
    }

    public function clockIn(Request $request)
    {
        $user = Auth::user();
        $today = Carbon::today();

        $attendance = Attendance::firstOrCreate(
            ['user_id' => $user->id, 'date' => $today],
            [
                'clock_in' => Carbon::now()->toTimeString(),
                'status' => 'present',
                'location' => $request->location,
                'device_info' => $request->device_info,
            ]
        );

        if ($attendance->wasRecentlyCreated) {
            return response()->json([
                'message' => '上班打卡成功',
                'attendance' => $attendance,
            ], 201);
        }

        return response()->json([
            'message' => '今天已经打过上班卡了',
            'attendance' => $attendance,
        ]);
    }

    public function clockOut(Request $request)
    {
        $user = Auth::user();
        $today = Carbon::today();

        $attendance = Attendance::where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        if (!$attendance) {
            return response()->json([
                'message' => '请先打上班卡',
            ], 400);
        }

        if ($attendance->clock_out) {
            return response()->json([
                'message' => '今天已经打过下班卡了',
                'attendance' => $attendance,
            ]);
        }

        $attendance->update([
            'clock_out' => Carbon::now()->toTimeString(),
        ]);

        return response()->json([
            'message' => '下班打卡成功',
            'attendance' => $attendance,
        ]);
    }

    public function today(Request $request)
    {
        $user = Auth::user();
        $today = Carbon::today();

        $attendance = Attendance::where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        return response()->json([
            'attendance' => $attendance,
            'current_time' => Carbon::now()->toDateTimeString(),
        ]);
    }

    public function stats(Request $request)
    {
        $user = Auth::user();
        $query = Attendance::query();

        if ($user->role === 'employee') {
            $query->where('user_id', $user->id);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('date', [$request->start_date, $request->end_date]);
        } else {
            $startDate = Carbon::now()->startOfMonth();
            $endDate = Carbon::now()->endOfMonth();
            $query->whereBetween('date', [$startDate, $endDate]);
        }

        $stats = [
            'total_days' => $query->count(),
            'present' => (clone $query)->where('status', 'present')->count(),
            'absent' => (clone $query)->where('status', 'absent')->count(),
            'late' => (clone $query)->where('status', 'late')->count(),
            'half_day' => (clone $query)->where('status', 'half_day')->count(),
        ];

        return response()->json($stats);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $attendance = Attendance::findOrFail($id);

        $validated = $request->validate([
            'clock_in' => 'nullable|date_format:H:i:s',
            'clock_out' => 'nullable|date_format:H:i:s',
            'break_start' => 'nullable|date_format:H:i:s',
            'break_end' => 'nullable|date_format:H:i:s',
            'status' => 'nullable|in:present,absent,late,half_day,on_leave',
            'notes' => 'nullable|string',
        ]);

        $attendance->update($validated);

        return response()->json([
            'message' => '考勤记录更新成功',
            'attendance' => $attendance,
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
