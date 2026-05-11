<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\JobPosting;
use App\Models\LeaveRequest;
use App\Models\PerformanceReview;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats()
    {
        $today = Carbon::today();
        $startOfMonth = $today->copy()->startOfMonth();
        $endOfMonth = $today->copy()->endOfMonth();

        $totalEmployees = Employee::where('status', 'active')->count();
        $newHires = Employee::whereBetween('hire_date', [$startOfMonth, $endOfMonth])->count();
        $terminations = Employee::where('status', 'terminated')
            ->whereBetween('termination_date', [$startOfMonth, $endOfMonth])->count();

        $totalDepartments = Department::count();

        $todayAttendance = Attendance::where('date', $today)->get();
        $presentToday = $todayAttendance->where('status', 'present')->count();
        $absentToday = $todayAttendance->where('status', 'absent')->count();
        $attendanceRate = $totalEmployees > 0 ? round(($presentToday / $totalEmployees) * 100, 2) : 0;

        $pendingLeaveRequests = LeaveRequest::where('status', 'pending')->count();
        $approvedThisMonth = LeaveRequest::where('status', 'approved')
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])->count();

        $activeJobs = JobPosting::where('status', 'published')->count();
        $newApplicants = Applicant::whereBetween('created_at', [$startOfMonth, $endOfMonth])->count();
        $interviewsThisMonth = Interview::whereBetween('scheduled_at', [$startOfMonth, $endOfMonth])->count();

        $pendingReviews = PerformanceReview::whereIn('status', ['self_review', 'manager_review'])->count();
        $completedReviews = PerformanceReview::where('status', 'completed')
            ->whereBetween('finalized_at', [$startOfMonth, $endOfMonth])->count();

        return response()->json([
            'employees' => [
                'total' => $totalEmployees,
                'new_hires' => $newHires,
                'terminations' => $terminations,
                'departments' => $totalDepartments,
            ],
            'attendance' => [
                'present_today' => $presentToday,
                'absent_today' => $absentToday,
                'attendance_rate' => $attendanceRate,
            ],
            'leave_requests' => [
                'pending' => $pendingLeaveRequests,
                'approved_this_month' => $approvedThisMonth,
            ],
            'recruitment' => [
                'active_jobs' => $activeJobs,
                'new_applicants' => $newApplicants,
                'interviews_this_month' => $interviewsThisMonth,
            ],
            'performance' => [
                'pending_reviews' => $pendingReviews,
                'completed_reviews' => $completedReviews,
            ],
        ]);
    }

    public function employeeDistribution()
    {
        $byDepartment = Department::withCount('employees')
            ->get()
            ->map(function ($dept) {
                return [
                    'name' => $dept->name,
                    'value' => $dept->employees_count,
                ];
            });

        $byStatus = Employee::select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getStatusLabel($item->status),
                    'value' => $item->count,
                ];
            });

        $byEmploymentType = Employee::select('employment_type', DB::raw('count(*) as count'))
            ->groupBy('employment_type')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getEmploymentTypeLabel($item->employment_type),
                    'value' => $item->count,
                ];
            });

        $byGender = Employee::select('gender', DB::raw('count(*) as count'))
            ->whereNotNull('gender')
            ->groupBy('gender')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getGenderLabel($item->gender),
                    'value' => $item->count,
                ];
            });

        return response()->json([
            'by_department' => $byDepartment,
            'by_status' => $byStatus,
            'by_employment_type' => $byEmploymentType,
            'by_gender' => $byGender,
        ]);
    }

    public function attendanceStats()
    {
        $today = Carbon::today();
        $startOfMonth = $today->copy()->startOfMonth();
        $endOfMonth = $today->copy()->endOfMonth();

        $monthlyAttendance = Attendance::select(
            DB::raw('date(date) as date'),
            DB::raw("count(case when status = 'present' then 1 end) as present"),
            DB::raw("count(case when status = 'absent' then 1 end) as absent"),
            DB::raw("count(case when status = 'late' then 1 end) as late")
        )
            ->whereBetween('date', [$startOfMonth, $endOfMonth])
            ->groupBy(DB::raw('date(date)'))
            ->orderBy('date')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date,
                    'present' => (int) $item->present,
                    'absent' => (int) $item->absent,
                    'late' => (int) $item->late,
                    'total' => (int) $item->present + (int) $item->absent + (int) $item->late,
                ];
            });

        $byStatus = Attendance::select('status', DB::raw('count(*) as count'))
            ->whereBetween('date', [$startOfMonth, $endOfMonth])
            ->groupBy('status')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getAttendanceStatusLabel($item->status),
                    'value' => (int) $item->count,
                ];
            });

        $leaveStats = LeaveRequest::select('leave_type', DB::raw('sum(total_days) as total_days'))
            ->where('status', 'approved')
            ->whereBetween('start_date', [$startOfMonth, $endOfMonth])
            ->groupBy('leave_type')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getLeaveTypeLabel($item->leave_type),
                    'value' => (float) $item->total_days,
                ];
            });

        return response()->json([
            'monthly_trend' => $monthlyAttendance,
            'by_status' => $byStatus,
            'leave_by_type' => $leaveStats,
        ]);
    }

    public function recruitmentStats()
    {
        $today = Carbon::today();
        $startOfMonth = $today->copy()->startOfMonth();
        $endOfMonth = $today->copy()->endOfMonth();

        $applicantsByStatus = Applicant::select('status', DB::raw('count(*) as count'))
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->groupBy('status')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getApplicantStatusLabel($item->status),
                    'value' => (int) $item->count,
                ];
            });

        $interviewsByType = Interview::select('type', DB::raw('count(*) as count'))
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->groupBy('type')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getInterviewTypeLabel($item->type),
                    'value' => (int) $item->count,
                ];
            });

        $hiringTrend = JobPosting::select(
            DB::raw("DATE_FORMAT(publish_date, '%Y-%m') as month"),
            DB::raw('count(*) as jobs_posted')
        )
            ->where('publish_date', '>=', $today->copy()->subMonths(6))
            ->groupBy(DB::raw("DATE_FORMAT(publish_date, '%Y-%m')"))
            ->orderBy('month')
            ->get();

        return response()->json([
            'applicants_by_status' => $applicantsByStatus,
            'interviews_by_type' => $interviewsByType,
            'hiring_trend' => $hiringTrend,
        ]);
    }

    public function performanceStats()
    {
        $completedReviews = PerformanceReview::where('status', 'completed')
            ->get();

        $ratingDistribution = [
            ['name' => '5.0', 'value' => $completedReviews->where('overall_rating', '>=', 4.5)->count()],
            ['name' => '4.0-4.4', 'value' => $completedReviews->whereBetween('overall_rating', [4.0, 4.4])->count()],
            ['name' => '3.0-3.9', 'value' => $completedReviews->whereBetween('overall_rating', [3.0, 3.9])->count()],
            ['name' => '2.0-2.9', 'value' => $completedReviews->whereBetween('overall_rating', [2.0, 2.9])->count()],
            ['name' => 'Below 2.0', 'value' => $completedReviews->where('overall_rating', '<', 2.0)->count()],
        ];

        $averageByDepartment = PerformanceReview::join('employees', 'performance_reviews.user_id', '=', 'employees.user_id')
            ->join('departments', 'employees.department_id', '=', 'departments.id')
            ->where('performance_reviews.status', 'completed')
            ->select('departments.name', DB::raw('avg(performance_reviews.overall_rating) as avg_rating'))
            ->groupBy('departments.id', 'departments.name')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $item->name,
                    'avg_rating' => round((float) $item->avg_rating, 2),
                ];
            });

        $statusBreakdown = PerformanceReview::select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->get()
            ->map(function ($item) {
                return [
                    'name' => $this->getReviewStatusLabel($item->status),
                    'value' => (int) $item->count,
                ];
            });

        return response()->json([
            'rating_distribution' => $ratingDistribution,
            'average_by_department' => $averageByDepartment,
            'status_breakdown' => $statusBreakdown,
        ]);
    }

    private function getStatusLabel($status)
    {
        $labels = [
            'active' => '在职',
            'inactive' => '非活跃',
            'terminated' => '已离职',
            'on_leave' => '休假中',
        ];
        return $labels[$status] ?? $status;
    }

    private function getEmploymentTypeLabel($type)
    {
        $labels = [
            'full_time' => '全职',
            'part_time' => '兼职',
            'contract' => '合同工',
            'intern' => '实习生',
        ];
        return $labels[$type] ?? $type;
    }

    private function getGenderLabel($gender)
    {
        $labels = ['male' => '男', 'female' => '女', 'other' => '其他'];
        return $labels[$gender] ?? $gender;
    }

    private function getAttendanceStatusLabel($status)
    {
        $labels = [
            'present' => '出勤',
            'absent' => '缺勤',
            'late' => '迟到',
            'half_day' => '半天',
            'on_leave' => '请假',
        ];
        return $labels[$status] ?? $status;
    }

    private function getLeaveTypeLabel($type)
    {
        $labels = [
            'annual' => '年假',
            'sick' => '病假',
            'personal' => '事假',
            'maternity' => '产假',
            'paternity' => '陪产假',
            'unpaid' => '无薪假',
            'other' => '其他',
        ];
        return $labels[$type] ?? $type;
    }

    private function getApplicantStatusLabel($status)
    {
        $labels = [
            'new' => '新申请',
            'reviewing' => '审核中',
            'shortlisted' => '已筛选',
            'interviewing' => '面试中',
            'offered' => '已发offer',
            'hired' => '已录用',
            'rejected' => '已拒绝',
        ];
        return $labels[$status] ?? $status;
    }

    private function getInterviewTypeLabel($type)
    {
        $labels = [
            'phone' => '电话面试',
            'video' => '视频面试',
            'onsite' => '现场面试',
            'technical' => '技术面试',
        ];
        return $labels[$type] ?? $type;
    }

    private function getReviewStatusLabel($status)
    {
        $labels = [
            'draft' => '草稿',
            'self_review' => '自评中',
            'manager_review' => '经理评估',
            'completed' => '已完成',
            'cancelled' => '已取消',
        ];
        return $labels[$status] ?? $status;
    }
}
