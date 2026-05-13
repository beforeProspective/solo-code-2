<?php

namespace App\Http\Controllers;

use App\Models\ServiceComponent;
use Illuminate\Http\Request;

class ServiceComponentController extends Controller
{
    public function index()
    {
        $components = ServiceComponent::orderBy('order', 'asc')->get();
        
        $grouped = [];
        foreach ($components as $component) {
            $group = $component->group_name ?? 'General';
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = $component;
        }
        
        return response()->json([
            'components' => $components,
            'grouped' => $grouped,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'group_name' => 'nullable|string|max:255',
            'status' => 'nullable|in:operational,degraded,partial_outage,major_outage',
            'status_label' => 'nullable|string|max:255',
            'order' => 'nullable|integer',
        ]);

        $component = ServiceComponent::create($validated);

        return response()->json($component, 201);
    }

    public function show(ServiceComponent $component)
    {
        return response()->json($component);
    }

    public function update(Request $request, ServiceComponent $component)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'group_name' => 'sometimes|nullable|string|max:255',
            'status' => 'sometimes|in:operational,degraded,partial_outage,major_outage',
            'status_label' => 'sometimes|nullable|string|max:255',
            'order' => 'sometimes|nullable|integer',
        ]);

        $component->update($validated);

        return response()->json($component);
    }

    public function updateStatus(Request $request, ServiceComponent $component)
    {
        $validated = $request->validate([
            'status' => 'required|in:operational,degraded,partial_outage,major_outage',
            'status_label' => 'nullable|string|max:255',
        ]);

        $component->update([
            'status' => $validated['status'],
            'status_label' => $validated['status_label'] ?? $component->status_label,
        ]);

        return response()->json($component);
    }

    public function destroy(ServiceComponent $component)
    {
        $component->delete();

        return response()->json(null, 204);
    }
}
