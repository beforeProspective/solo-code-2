<?php

namespace App\Http\Controllers;

use App\Models\Metric;
use App\Models\MetricPoint;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MetricController extends Controller
{
    public function index()
    {
        $metrics = Metric::orderBy('order', 'asc')->get();
        return response()->json($metrics);
    }

    public function publicIndex()
    {
        $metrics = Metric::where('visible', true)->orderBy('order', 'asc')->get();
        return response()->json($metrics);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'suffix' => 'nullable|string|max:50',
            'default_value' => 'nullable|integer',
            'visible' => 'nullable|boolean',
            'order' => 'nullable|integer',
        ]);

        $metric = Metric::create($validated);

        return response()->json($metric, 201);
    }

    public function update(Request $request, Metric $metric)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'suffix' => 'sometimes|nullable|string|max:50',
            'default_value' => 'sometimes|nullable|integer',
            'visible' => 'sometimes|boolean',
            'order' => 'sometimes|nullable|integer',
        ]);

        $metric->update($validated);

        return response()->json($metric);
    }

    public function destroy(Metric $metric)
    {
        $metric->delete();
        return response()->json(null, 204);
    }

    public function getPoints(Metric $metric, Request $request)
    {
        $hours = $request->query('hours', 24);
        $points = MetricPoint::where('metric_id', $metric->id)
            ->where('created_at', '>=', Carbon::now()->subHours($hours))
            ->orderBy('created_at', 'asc')
            ->get();

        return response()->json([
            'metric' => $metric,
            'points' => $points,
        ]);
    }

    public function addPoint(Request $request, Metric $metric)
    {
        $validated = $request->validate([
            'value' => 'required|integer',
            'created_at' => 'nullable|date',
        ]);

        $point = MetricPoint::create([
            'metric_id' => $metric->id,
            'value' => $validated['value'],
            'created_at' => $validated['created_at'] ?? now(),
        ]);

        return response()->json($point, 201);
    }
}
