<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class DepartmentController extends Controller
{
    public function index()
    {
        $departments = Department::with('manager.employee', 'positions', 'employees')
            ->get();

        return response()->json($departments);
    }

    public function show($id)
    {
        $department = Department::with('manager.employee', 'positions', 'employees.user')
            ->findOrFail($id);

        return response()->json($department);
    }

    public function store(Request $request)
    {
        $this->authorizeRole(['admin', 'hr']);

        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:departments',
            'description' => 'nullable|string',
            'parent_id' => 'nullable|exists:departments,id',
            'manager_id' => 'nullable|exists:users,id',
        ]);

        $department = Department::create($validated);

        return response()->json([
            'message' => '部门创建成功',
            'department' => $department,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $department = Department::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255|unique:departments,name,' . $id,
            'description' => 'nullable|string',
            'parent_id' => 'nullable|exists:departments,id',
            'manager_id' => 'nullable|exists:users,id',
        ]);

        $department->update($validated);

        return response()->json([
            'message' => '部门更新成功',
            'department' => $department,
        ]);
    }

    public function destroy($id)
    {
        $this->authorizeRole(['admin', 'hr']);

        $department = Department::findOrFail($id);
        $department->delete();

        return response()->json([
            'message' => '部门已删除',
        ]);
    }

    public function tree()
    {
        $departments = Department::with('children.children')
            ->whereNull('parent_id')
            ->get();

        return response()->json($departments);
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
