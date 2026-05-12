<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\Ticket;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TicketController extends Controller
{
    public function index($eventId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $tickets = Ticket::where('event_id', $eventId)->latest()->get();

        return response()->json($tickets);
    }

    public function store(Request $request, $eventId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'required|in:free,paid,donation',
            'price' => 'required_if:type,paid|numeric|min:0',
            'quantity' => 'nullable|integer|min:1',
            'min_donation' => 'required_if:type,donation|numeric|min:0',
            'start_sale_at' => 'nullable|date',
            'end_sale_at' => 'nullable|date|after:start_sale_at',
            'is_active' => 'boolean',
        ]);

        if ($validated['type'] === 'free') {
            $validated['price'] = 0;
        }

        $ticket = Ticket::create([
            'event_id' => $eventId,
            ...$validated,
        ]);

        return response()->json([
            'message' => 'Ticket created successfully',
            'ticket' => $ticket,
        ], 201);
    }

    public function show($eventId, $ticketId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $ticket = Ticket::where('event_id', $eventId)->findOrFail($ticketId);

        return response()->json($ticket);
    }

    public function update(Request $request, $eventId, $ticketId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $ticket = Ticket::where('event_id', $eventId)->findOrFail($ticketId);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'type' => 'sometimes|in:free,paid,donation',
            'price' => 'required_if:type,paid|numeric|min:0',
            'quantity' => 'nullable|integer|min:1',
            'min_donation' => 'required_if:type,donation|numeric|min:0',
            'start_sale_at' => 'nullable|date',
            'end_sale_at' => 'nullable|date|after:start_sale_at',
            'is_active' => 'boolean',
        ]);

        if (isset($validated['type']) && $validated['type'] === 'free') {
            $validated['price'] = 0;
        }

        $ticket->update($validated);

        return response()->json([
            'message' => 'Ticket updated successfully',
            'ticket' => $ticket,
        ]);
    }

    public function destroy($eventId, $ticketId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $ticket = Ticket::where('event_id', $eventId)->findOrFail($ticketId);

        $ticket->delete();

        return response()->json(['message' => 'Ticket deleted successfully']);
    }
}
