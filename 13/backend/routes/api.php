<?php

use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\LeaveRequestController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PerformanceReviewController;
use App\Http\Controllers\Api\RecruitmentController;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login']);
Route::post('register', [AuthController::class, 'register']);

Route::middleware('auth:api')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::post('refresh', [AuthController::class, 'refresh']);
    Route::get('me', [AuthController::class, 'me']);
    Route::put('profile', [AuthController::class, 'updateProfile']);

    Route::get('employees/org-chart', [EmployeeController::class, 'orgChart']);
    Route::apiResource('employees', EmployeeController::class);

    Route::get('departments/tree', [DepartmentController::class, 'tree']);
    Route::apiResource('departments', DepartmentController::class);

    Route::post('attendances/clock-in', [AttendanceController::class, 'clockIn']);
    Route::post('attendances/clock-out', [AttendanceController::class, 'clockOut']);
    Route::get('attendances/today', [AttendanceController::class, 'today']);
    Route::get('attendances/stats', [AttendanceController::class, 'stats']);
    Route::apiResource('attendances', AttendanceController::class);

    Route::post('leave-requests/{id}/approve', [LeaveRequestController::class, 'approve']);
    Route::post('leave-requests/{id}/reject', [LeaveRequestController::class, 'reject']);
    Route::apiResource('leave-requests', LeaveRequestController::class);

    Route::post('performance-reviews/{id}/submit-self-review', [PerformanceReviewController::class, 'submitSelfReview']);
    Route::post('performance-reviews/{id}/submit-manager-review', [PerformanceReviewController::class, 'submitManagerReview']);
    Route::apiResource('performance-reviews', PerformanceReviewController::class);

    Route::get('recruitment/jobs', [RecruitmentController::class, 'jobPostings']);
    Route::get('recruitment/jobs/{id}', [RecruitmentController::class, 'showJobPosting']);
    Route::post('recruitment/jobs', [RecruitmentController::class, 'storeJobPosting']);
    Route::put('recruitment/jobs/{id}', [RecruitmentController::class, 'updateJobPosting']);

    Route::get('recruitment/applicants', [RecruitmentController::class, 'applicants']);
    Route::get('recruitment/applicants/{id}', [RecruitmentController::class, 'showApplicant']);
    Route::post('recruitment/applicants', [RecruitmentController::class, 'storeApplicant']);
    Route::put('recruitment/applicants/{id}', [RecruitmentController::class, 'updateApplicant']);

    Route::get('recruitment/interviews', [RecruitmentController::class, 'interviews']);
    Route::get('recruitment/interviews/{id}', [RecruitmentController::class, 'showInterview']);
    Route::post('recruitment/interviews', [RecruitmentController::class, 'storeInterview']);
    Route::put('recruitment/interviews/{id}', [RecruitmentController::class, 'updateInterview']);

    Route::apiResource('announcements', AnnouncementController::class);

    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('notifications/mark-all-read', [NotificationController::class, 'markAllAsRead']);
    Route::post('notifications/{id}/mark-read', [NotificationController::class, 'markAsRead']);
    Route::apiResource('notifications', NotificationController::class);

    Route::get('documents/categories', [DocumentController::class, 'categories']);
    Route::post('documents/categories', [DocumentController::class, 'storeCategory']);
    Route::post('documents/upload', [DocumentController::class, 'upload']);
    Route::get('documents/{id}/download', [DocumentController::class, 'download']);
    Route::apiResource('documents', DocumentController::class);

    Route::prefix('dashboard')->group(function () {
        Route::get('stats', [DashboardController::class, 'stats']);
        Route::get('employee-distribution', [DashboardController::class, 'employeeDistribution']);
        Route::get('attendance-stats', [DashboardController::class, 'attendanceStats']);
        Route::get('recruitment-stats', [DashboardController::class, 'recruitmentStats']);
        Route::get('performance-stats', [DashboardController::class, 'performanceStats']);
    });
});
