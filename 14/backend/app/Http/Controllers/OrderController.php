<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class OrderController extends Controller
{
    public function index($eventId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $orders = Order::where('event_id', $eventId)
            ->with('items')
            ->latest()
            ->paginate(20);

        return response()->json($orders);
    }

    public function show($eventId, $orderId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $order = Order::where('event_id', $eventId)
            ->with(['items', 'attendees'])
            ->findOrFail($orderId);

        return response()->json($order);
    }

    public function update(Request $request, $eventId, $orderId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $order = Order::where('event_id', $eventId)->findOrFail($orderId);

        $validated = $request->validate([
            'status' => 'required|in:pending,confirmed,cancelled,refunded',
        ]);

        $order->update($validated);

        return response()->json([
            'message' => 'Order updated successfully',
            'order' => $order,
        ]);
    }

    public function refund(Request $request, $eventId, $orderId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $order = Order::where('event_id', $eventId)->findOrFail($orderId);

        if ($order->status === 'refunded') {
            return response()->json(['message' => 'Order already refunded'], 400);
        }

        $order->update(['status' => 'refunded']);

        return response()->json([
            'message' => 'Order refunded successfully',
            'order' => $order,
        ]);
    }

    public function exportCsv($eventId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->findOrFail($eventId);

        $attendees = $event->attendees()
            ->with('order')
            ->get();

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="attendees-' . $event->slug . '.csv"',
        ];

        $callback = function () use ($attendees) {
            $file = fopen('php://output', 'w');
            fputcsv($file, ['Name', 'Email', 'Phone', 'Ticket Type', 'Ticket Code', 'Order Number', 'Checked In', 'Checked In At']);

            foreach ($attendees as $attendee) {
                fputcsv($file, [
                    $attendee->name,
                    $attendee->email,
                    $attendee->phone ?? '',
                    $attendee->ticket_name,
                    $attendee->ticket_code,
                    $attendee->order?->order_number ?? '',
                    $attendee->checked_in ? 'Yes' : 'No',
                    $attendee->checked_in_at ? $attendee->checked_in_at->format('Y-m-d H:i:s') : '',
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }
}
