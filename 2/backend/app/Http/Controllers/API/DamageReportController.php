<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\DamageReport;
use App\Models\Tool;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DamageReportController extends Controller
{
    public function index(Request $request)
    {
        $query = DamageReport::with('tool', 'reporter');

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $reports = $query->latest()->paginate(12);
        return response()->json($reports);
    }

    public function myReports()
    {
        $reports = DamageReport::with('tool', 'reporter')
            ->where('reporter_id', Auth::id())
            ->latest()
            ->paginate(12);
        return response()->json($reports);
    }

    public function store(Request $request)
    {
        $request->validate([
            'tool_id' => 'required|exists:tools,id',
            'damage_level' => 'required|in:minor,moderate,severe',
            'description' => 'required|string',
        ]);

        $report = DamageReport::create([
            'tool_id' => $request->tool_id,
            'reporter_id' => Auth::id(),
            'damage_level' => $request->damage_level,
            'description' => $request->description,
            'status' => 'pending',
        ]);

        $tool = Tool::find($request->tool_id);
        if ($request->damage_level === 'severe') {
            $tool->update(['status' => 'maintenance']);
        }

        return response()->json($report->load('tool', 'reporter'), 201);
    }

    public function show(DamageReport $damageReport)
    {
        return response()->json($damageReport->load('tool', 'reporter'));
    }

    public function update(Request $request, DamageReport $damageReport)
    {
        if (!Auth::user()->is_admin) {
            return response()->json(['message' => '无权操作'], 403);
        }

        $request->validate([
            'status' => 'required|in:pending,reviewed,resolved',
        ]);

        $damageReport->update(['status' => $request->status]);

        return response()->json($damageReport->load('tool', 'reporter'));
    }

    public function destroy(DamageReport $damageReport)
    {
        if ($damageReport->reporter_id !== Auth::id() && !Auth::user()->is_admin) {
            return response()->json(['message' => '无权操作'], 403);
        }

        $damageReport->delete();

        return response()->json(['message' => '报告已删除']);
    }
}
