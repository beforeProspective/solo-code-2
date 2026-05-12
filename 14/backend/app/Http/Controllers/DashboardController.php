<?php

namespace App\Http\Controllers;

use App\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function stats()
    {
        $userId = Auth::guard('api')->id();
        $events = Event::where('user_id', $userId)->get();

        $totalEvents = $events->count();
        $totalTicketsSold = 0;
        $totalRevenue = 0;
        $totalAttendees = 0;

        foreach ($events as $event) {
            $orders = $event->orders()->where('status', '!=', 'cancelled')->get();
            $totalTicketsSold += $orders->sum(function ($order) {
                return $order->items->sum('quantity');
            });
            $totalRevenue += $orders->sum('total_amount');
            $totalAttendees += $event->attendees()->count();
        }

        return response()->json([
            'total_events' => $totalEvents,
            'total_tickets_sold' => $totalTicketsSold,
            'total_revenue' => (float) $totalRevenue,
            'total_attendees' => $totalAttendees,
        ]);
    }

    public function eventStats($eventId)
    {
        $event = Event::where('user_id', Auth::guard('api')->id())
            ->with(['tickets', 'orders'])
            ->findOrFail($eventId);

        $ticketsSold = 0;
        $revenue = 0;
        $confirmedOrders = $event->orders()->whereIn('status', ['confirmed', 'pending'])->get();

        foreach ($confirmedOrders as $order) {
            $ticketsSold += $order->items->sum('quantity');
            $revenue += $order->total_amount;
        }

        $ticketStats = [];
        foreach ($event->tickets as $ticket) {
            $sold = 0;
            $ticketRevenue = 0;

            foreach ($confirmedOrders as $order) {
                foreach ($order->items as $item) {
                    if ($item->ticket_id === $ticket->id) {
                        $sold += $item->quantity;
                        $ticketRevenue += $item->subtotal;
                    }
                }
            }

            $ticketStats[] = [
                'id' => $ticket->id,
                'name' => $ticket->name,
                'type' => $ticket->type,
                'quantity' => $ticket->quantity,
                'sold' => $sold,
                'revenue' => (float) $ticketRevenue,
                'remaining' => $ticket->quantity ? $ticket->quantity - $sold : null,
            ];
        }

        $recentOrders = $event->orders()
            ->with('items')
            ->latest()
            ->limit(10)
            ->get();

        return response()->json([
            'event' => [
                'id' => $event->id,
                'title' => $event->title,
                'start_time' => $event->start_time,
                'end_time' => $event->end_time,
            ],
            'tickets_sold' => $ticketsSold,
            'revenue' => (float) $revenue,
            'checked_in' => $event->attendees()->where('checked_in', true)->count(),
            'ticket_stats' => $ticketStats,
            'recent_orders' => $recentOrders,
        ]);
    }
}
