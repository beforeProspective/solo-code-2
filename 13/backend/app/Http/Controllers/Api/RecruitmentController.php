<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Models\Interview;
use App\Models\JobPosting;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class RecruitmentController extends Controller
{
    public function jobPostings(Request $request)
    {
        $query = JobPosting::with('department', 'position', 'creator.employee')
            ->withCount('applicants');

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $jobs = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($jobs);
    }

    public function showJobPosting($id)
    {
        $job = JobPosting::with('department', 'position', 'creator.employee', 'applicants')
            ->findOrFail($id);

        return response()->json($job);
    }

    public function storeJobPosting(Request $request)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'department_id' => 'required|exists:departments,id',
            'position_id' => 'nullable|exists:positions,id',
            'description' => 'required|string',
            'requirements' => 'nullable|array',
            'benefits' => 'nullable|array',
            'min_salary' => 'nullable|numeric',
            'max_salary' => 'nullable|numeric|gte:min_salary',
            'location' => 'required|string',
            'employment_type' => 'required|in:full_time,part_time,contract,intern',
            'publish_date' => 'nullable|date',
            'close_date' => 'nullable|date|after:publish_date',
            'status' => 'nullable|in:draft,published,closed',
        ]);

        $validated['created_by'] = Auth::id();

        $job = JobPosting::create($validated);

        return response()->json([
            'message' => '职位创建成功',
            'job' => $job,
        ], 201);
    }

    public function updateJobPosting(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $job = JobPosting::findOrFail($id);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'department_id' => 'sometimes|exists:departments,id',
            'position_id' => 'nullable|exists:positions,id',
            'description' => 'sometimes|string',
            'requirements' => 'nullable|array',
            'benefits' => 'nullable|array',
            'min_salary' => 'nullable|numeric',
            'max_salary' => 'nullable|numeric|gte:min_salary',
            'location' => 'sometimes|string',
            'employment_type' => 'sometimes|in:full_time,part_time,contract,intern',
            'publish_date' => 'nullable|date',
            'close_date' => 'nullable|date|after:publish_date',
            'status' => 'sometimes|in:draft,published,closed',
        ]);

        $job->update($validated);

        return response()->json([
            'message' => '职位更新成功',
            'job' => $job,
        ]);
    }

    public function applicants(Request $request)
    {
        $query = Applicant::with('jobPosting', 'referredBy.employee', 'interviews');

        if ($request->has('job_posting_id')) {
            $query->where('job_posting_id', $request->job_posting_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $applicants = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($applicants);
    }

    public function showApplicant($id)
    {
        $applicant = Applicant::with('jobPosting', 'referredBy.employee', 'interviews.interviewer.employee')
            ->findOrFail($id);

        return response()->json($applicant);
    }

    public function storeApplicant(Request $request)
    {
        $validated = $request->validate([
            'job_posting_id' => 'required|exists:job_postings,id',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255',
            'phone' => 'required|string|max:20',
            'cover_letter' => 'nullable|string',
            'skills' => 'nullable|array',
            'rating' => 'nullable|numeric|min:0|max:5',
            'status' => 'nullable|in:new,reviewing,shortlisted,interviewing,offered,hired,rejected',
        ]);

        $applicant = Applicant::create($validated);

        $managers = \App\Models\User::whereIn('role', ['admin', 'hr'])->get();
        foreach ($managers as $manager) {
            Notification::create([
                'user_id' => $manager->id,
                'title' => '新简历收到',
                'message' => "收到新的简历申请：{$applicant->full_name}",
                'type' => 'recruitment',
                'action_url' => "/recruitment/applicants/{$applicant->id}",
            ]);
        }

        return response()->json([
            'message' => '简历提交成功',
            'applicant' => $applicant,
        ], 201);
    }

    public function updateApplicant(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $applicant = Applicant::findOrFail($id);

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => 'sometimes|string|email|max:255',
            'phone' => 'sometimes|string|max:20',
            'cover_letter' => 'nullable|string',
            'skills' => 'nullable|array',
            'rating' => 'nullable|numeric|min:0|max:5',
            'status' => 'sometimes|in:new,reviewing,shortlisted,interviewing,offered,hired,rejected',
            'notes' => 'nullable|string',
        ]);

        $applicant->update($validated);

        return response()->json([
            'message' => '简历更新成功',
            'applicant' => $applicant,
        ]);
    }

    public function interviews(Request $request)
    {
        $query = Interview::with('applicant', 'jobPosting', 'interviewer.employee');

        if ($request->has('applicant_id')) {
            $query->where('applicant_id', $request->applicant_id);
        }

        if ($request->has('interviewer_id')) {
            $query->where('interviewer_id', $request->interviewer_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $interviews = $query->orderBy('scheduled_at', 'asc')
            ->paginate($request->get('per_page', 15));

        return response()->json($interviews);
    }

    public function showInterview($id)
    {
        $interview = Interview::with('applicant', 'jobPosting', 'interviewer.employee')
            ->findOrFail($id);

        return response()->json($interview);
    }

    public function storeInterview(Request $request)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $validated = $request->validate([
            'applicant_id' => 'required|exists:applicants,id',
            'job_posting_id' => 'required|exists:job_postings,id',
            'scheduled_at' => 'required|date|after:now',
            'interviewer_id' => 'required|exists:users,id',
            'type' => 'required|in:phone,video,onsite,technical',
            'location' => 'nullable|string',
            'meeting_link' => 'nullable|url',
        ]);

        $interview = Interview::create(array_merge($validated, [
            'status' => 'scheduled',
        ]));

        Notification::create([
            'user_id' => $validated['interviewer_id'],
            'title' => '面试安排',
            'message' => '您有一个新的面试安排',
            'type' => 'task',
            'action_url' => "/recruitment/interviews/{$interview->id}",
        ]);

        return response()->json([
            'message' => '面试安排成功',
            'interview' => $interview,
        ], 201);
    }

    public function updateInterview(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $interview = Interview::findOrFail($id);

        $validated = $request->validate([
            'scheduled_at' => 'sometimes|date',
            'interviewer_id' => 'sometimes|exists:users,id',
            'type' => 'sometimes|in:phone,video,onsite,technical',
            'location' => 'nullable|string',
            'meeting_link' => 'nullable|url',
            'status' => 'sometimes|in:scheduled,completed,cancelled,no_show',
            'feedback' => 'nullable|string',
            'rating' => 'nullable|numeric|min:0|max:5',
            'notes' => 'nullable|string',
        ]);

        $interview->update($validated);

        return response()->json([
            'message' => '面试信息更新成功',
            'interview' => $interview,
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
