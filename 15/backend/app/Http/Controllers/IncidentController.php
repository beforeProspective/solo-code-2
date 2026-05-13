<?php

namespace App\Http\Controllers;

use App\Models\Incident;
use App\Models\IncidentUpdate;
use App\Models\EventComponent;
use Illuminate\Http\Request;

class IncidentController extends Controller
{
    public function index(Request $request)
    {
        $query = Incident::with(['updates', 'components.component'])->orderBy('created_at', 'desc');
        
        $isMaintenance = $request->query('maintenance');
        if ($isMaintenance !== null) {
            $query->where('is_maintenance', filter_var($isMaintenance, FILTER_VALIDATE_BOOLEAN));
        }

        $status = $request->query('status');
        if ($status) {
            $query->where('status', $status);
        }

        $incidents = $query->paginate(20);

        return response()->json($incidents);
    }

    public function publicIndex()
    {
        $incidents = Incident::with(['updates', 'components.component'])
            ->where('is_maintenance', false)
            ->orderBy('created_at', 'desc')
            ->limit(30)
            ->get();

        return response()->json($incidents);
    }

    public function scheduledMaintenances()
    {
        $maintenances = Incident::with(['updates', 'components.component'])
            ->where('is_maintenance', true)
            ->whereIn('status', ['investigating', 'identified', 'monitoring'])
            ->orderBy('scheduled_at', 'asc')
            ->get();

        return response()->json($maintenances);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:investigating,identified,monitoring,resolved',
            'impact' => 'nullable|in:none,minor,major,critical',
            'started_at' => 'nullable|date',
            'resolved_at' => 'nullable|date',
            'is_maintenance' => 'nullable|boolean',
            'scheduled_at' => 'nullable|date',
            'scheduled_end_at' => 'nullable|date',
            'components' => 'nullable|array',
            'components.*.id' => 'required|exists:service_components,id',
            'components.*.status' => 'nullable|in:operational,degraded,partial_outage,major_outage',
        ]);

        $validated['started_at'] = $validated['started_at'] ?? now();

        $incident = Incident::create(array_merge($validated, [
            'status' => $validated['status'] ?? 'investigating',
            'impact' => $validated['impact'] ?? 'none',
        ]));

        if (!empty($validated['description'])) {
            IncidentUpdate::create([
                'incident_id' => $incident->id,
                'status' => $incident->status,
                'content' => $validated['description'],
            ]);
        }

        if (isset($validated['components'])) {
            foreach ($validated['components'] as $comp) {
                EventComponent::create([
                    'incident_id' => $incident->id,
                    'service_component_id' => $comp['id'],
                    'status' => $comp['status'] ?? null,
                ]);
            }
        }

        return response()->json($incident->load(['updates', 'components.component']), 201);
    }

    public function show(Incident $incident)
    {
        return response()->json($incident->load(['updates', 'components.component']));
    }

    public function update(Request $request, Incident $incident)
    {
        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'status' => 'sometimes|in:investigating,identified,monitoring,resolved',
            'impact' => 'sometimes|in:none,minor,major,critical',
            'started_at' => 'sometimes|nullable|date',
            'resolved_at' => 'sometimes|nullable|date',
            'is_maintenance' => 'sometimes|nullable|boolean',
            'scheduled_at' => 'sometimes|nullable|date',
            'scheduled_end_at' => 'sometimes|nullable|date',
        ]);

        if (isset($validated['status']) && $validated['status'] === 'resolved') {
            $validated['resolved_at'] = now();
        }

        $incident->update($validated);

        return response()->json($incident->load(['updates', 'components.component']));
    }

    public function addUpdate(Request $request, Incident $incident)
    {
        $validated = $request->validate([
            'status' => 'required|in:investigating,identified,monitoring,resolved',
            'content' => 'required|string',
        ]);

        $update = IncidentUpdate::create([
            'incident_id' => $incident->id,
            'status' => $validated['status'],
            'content' => $validated['content'],
        ]);

        $incident->update(['status' => $validated['status']]);

        if ($validated['status'] === 'resolved' && !$incident->resolved_at) {
            $incident->update(['resolved_at' => now()]);
        }

        return response()->json($update, 201);
    }

    public function destroy(Incident $incident)
    {
        $incident->delete();

        return response()->json(null, 204);
    }
}
