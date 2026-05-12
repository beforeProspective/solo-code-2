<?php

namespace App\Http\Controllers;

use App\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class EventController extends Controller
{
    public function index()
    {
        $events = Event::where('user_id', Auth::guard('api')->id())
            ->withCount(['orders', 'attendees'])
            ->latest()
            ->paginate(10);

        return response()->json($events);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'cover_image' => 'nullable|string',
            'location' => 'required|string|max:255',
            'address' => 'nullable|string|max:500',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
            'is_published' => 'boolean',
            'registration_open' => 'boolean',
            'max_attendees' => 'nullable|integer|min:1',
            'custom_fields' => 'nullable|array',
        ]);

        $event = Event::create([
            'user_id' => Auth::guard('api')->id(),
            ...$validated,
        ]);

        return response()->json([
            'message' => 'Event created successfully',
            'event' => $event,
        ], 201);
    }

    public function show($id)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->with(['tickets', 'orders', 'attendees'])
            ->findOrFail($id);

        return response()->json($event);
    }

    public function update(Request $request, $id)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($id);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'cover_image' => 'nullable|string',
            'location' => 'sometimes|string|max:255',
            'address' => 'nullable|string|max:500',
            'start_time' => 'sometimes|date',
            'end_time' => 'sometimes|date|after:start_time',
            'is_published' => 'boolean',
            'registration_open' => 'boolean',
            'max_attendees' => 'nullable|integer|min:1',
            'custom_fields' => 'nullable|array',
        ]);

        if (isset($validated['title']) && $validated['title'] !== $event->title) {
            $validated['slug'] = Str::slug($validated['title']) . '-' . Str::random(8);
        }

        $event->update($validated);

        return response()->json([
            'message' => 'Event updated successfully',
            'event' => $event,
        ]);
    }

    public function destroy($id)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($id);

        $event->delete();

        return response()->json(['message' => 'Event deleted successfully']);
    }

    public function uploadImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif|max:10240',
        ]);

        $path = $request->file('image')->store('events', 'public');

        return response()->json([
            'url' => url('/storage/' . $path),
            'path' => $path,
        ]);
    }
}
