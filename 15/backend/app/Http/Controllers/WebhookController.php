<?php

namespace App\Http\Controllers;

use App\Models\Webhook;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    public function index()
    {
        $webhooks = Webhook::orderBy('created_at', 'desc')->get();
        return response()->json($webhooks);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'url' => 'required|url',
            'events' => 'nullable|array',
            'active' => 'nullable|boolean',
        ]);

        $webhook = Webhook::create([
            'url' => $validated['url'],
            'events' => $validated['events'] ?? ['incident_created', 'incident_updated', 'incident_resolved'],
            'active' => $validated['active'] ?? true,
        ]);

        return response()->json($webhook, 201);
    }

    public function update(Request $request, Webhook $webhook)
    {
        $validated = $request->validate([
            'url' => 'sometimes|url',
            'events' => 'sometimes|array',
            'active' => 'sometimes|boolean',
        ]);

        $webhook->update($validated);

        return response()->json($webhook);
    }

    public function destroy(Webhook $webhook)
    {
        $webhook->delete();

        return response()->json(null, 204);
    }
}
