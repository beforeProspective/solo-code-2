<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $query = Employee::with('user', 'department', 'position', 'manager.employee');

        if ($request->has('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('employee_code', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($q2) use ($search) {
                      $q2->where('email', 'like', "%{$search}%");
                  });
            });
        }

        $employees = $query->paginate($request->get('per_page', 15));

        return response()->json($employees);
    }

    public function show($id)
    {
        $employee = Employee::with('user', 'department', 'position', 'manager.employee')
            ->findOrFail($id);

        return response()->json($employee);
    }

    public function store(Request $request)
    {
        $this->authorizeRole(['admin', 'hr']);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:6',
            'role' => 'required|in:admin,hr,manager,employee',
            'employee_code' => 'required|string|unique:employees',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'gender' => 'nullable|in:male,female,other',
            'date_of_birth' => 'nullable|date',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'emergency_contact_name' => 'nullable|string|max:100',
            'emergency_contact_phone' => 'nullable|string|max:20',
            'id_number' => 'nullable|string|max:50',
            'hire_date' => 'required|date',
            'department_id' => 'required|exists:departments,id',
            'position_id' => 'required|exists:positions,id',
            'manager_id' => 'nullable|exists:users,id',
            'salary' => 'nullable|numeric',
            'employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            'work_location' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,terminated,on_leave',
        ]);

        return DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => $validated['role'],
            ]);

            $employee = Employee::create(array_merge($validated, ['user_id' => $user->id]));

            return response()->json([
                'message' => '员工创建成功',
                'employee' => $employee->load('user', 'department', 'position'),
            ], 201);
        });
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr', 'manager']);

        $employee = Employee::findOrFail($id);

        $validated = $request->validate([
            'employee_code' => 'sometimes|string|unique:employees,employee_code,' . $id,
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'gender' => 'nullable|in:male,female,other',
            'date_of_birth' => 'nullable|date',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'emergency_contact_name' => 'nullable|string|max:100',
            'emergency_contact_phone' => 'nullable|string|max:20',
            'id_number' => 'nullable|string|max:50',
            'hire_date' => 'sometimes|date',
            'department_id' => 'sometimes|exists:departments,id',
            'position_id' => 'sometimes|exists:positions,id',
            'manager_id' => 'nullable|exists:users,id',
            'salary' => 'nullable|numeric',
            'employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            'work_location' => 'nullable|string',
            'status' => 'nullable|in:active,inactive,terminated,on_leave',
        ]);

        $employee->update($validated);

        return response()->json([
            'message' => '员工信息更新成功',
            'employee' => $employee->load('user', 'department', 'position'),
        ]);
    }

    public function destroy($id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $employee = Employee::findOrFail($id);
        $employee->user->delete();

        return response()->json([
            'message' => '员工已删除',
        ]);
    }

    public function orgChart()
    {
        $departments = \App\Models\Department::with([
            'manager.employee',
            'positions',
            'employees.user',
            'children' => function ($q) {
                $q->with('manager.employee', 'employees.user');
            }
        ])->whereNull('parent_id')->get();

        $allEmployees = \App\Models\Employee::with('user', 'department', 'position', 'manager')
            ->where('status', 'active')
            ->get();

        return response()->json([
            'departments' => $departments,
            'employees' => $allEmployees,
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
