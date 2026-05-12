<?php

namespace App\Http\Controllers;

use App\Models\Attendee;
use App\Models\Event;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Ticket;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use SimpleSoftwareIO\QrCode\Facades\QrCode;

class PublicEventController extends Controller
{
    public function index()
    {
        $events = Event::where('is_published', true)
            ->where('end_time', '>', Carbon::now())
            ->withCount(['orders', 'attendees'])
            ->latest()
            ->paginate(12);

        return response()->json($events);
    }

    public function show($slug)
    {
        $event = Event::where('slug', $slug)
            ->where('is_published', true)
            ->with(['tickets' => function ($query) {
                $query->where('is_active', true);
            }])
            ->firstOrFail();

        $tickets = $event->tickets->filter(function ($ticket) {
            $now = Carbon::now();
            $startSale = $ticket->start_sale_at ? Carbon::parse($ticket->start_sale_at) : null;
            $endSale = $ticket->end_sale_at ? Carbon::parse($ticket->end_sale_at) : null;

            if ($startSale && $now->lt($startSale)) {
                return false;
            }
            if ($endSale && $now->gt($endSale)) {
                return false;
            }
            return true;
        });

        $event->setRelation('tickets', $tickets);

        return response()->json($event);
    }

    public function register(Request $request, $slug)
    {
        $event = Event::where('slug', $slug)
            ->where('is_published', true)
            ->where('registration_open', true)
            ->firstOrFail();

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_email' => 'required|email|max:255',
            'customer_phone' => 'nullable|string|max:20',
            'tickets' => 'required|array|min:1',
            'tickets.*.ticket_id' => 'required|exists:tickets,id',
            'tickets.*.quantity' => 'required|integer|min:1',
            'tickets.*.price' => 'nullable|numeric',
            'attendees' => 'required|array',
            'form_data' => 'nullable|array',
        ]);

        DB::beginTransaction();

        try {
            $totalAmount = 0;
            $orderItems = [];
            $ticketsToCreate = [];

            foreach ($validated['tickets'] as $ticketData) {
                $ticket = Ticket::where('id', $ticketData['ticket_id'])
                    ->where('event_id', $event->id)
                    ->where('is_active', true)
                    ->firstOrFail();

                $price = $ticket->type === 'donation'
                    ? max($ticket->min_donation ?? 0, $ticketData['price'] ?? 0)
                    : $ticket->price;

                $quantity = $ticketData['quantity'];

                if ($ticket->quantity) {
                    $sold = OrderItem::where('ticket_id', $ticket->id)
                        ->whereHas('order', function ($q) {
                            $q->whereIn('status', ['pending', 'confirmed']);
                        })
                        ->sum('quantity');

                    if ($sold + $quantity > $ticket->quantity) {
                        throw new \Exception("Ticket '{$ticket->name}' is sold out");
                    }
                }

                $subtotal = $price * $quantity;
                $totalAmount += $subtotal;

                $orderItems[] = [
                    'ticket_id' => $ticket->id,
                    'ticket_name' => $ticket->name,
                    'price' => $price,
                    'quantity' => $quantity,
                    'subtotal' => $subtotal,
                ];

                for ($i = 0; $i < $quantity; $i++) {
                    $attendeeIndex = count($ticketsToCreate);
                    $attendeeData = $validated['attendees'][$attendeeIndex] ?? [
                        'name' => $validated['customer_name'],
                        'email' => $validated['customer_email'],
                        'phone' => $validated['customer_phone'] ?? null,
                    ];

                    $ticketsToCreate[] = [
                        'ticket_id' => $ticket->id,
                        'ticket_name' => $ticket->name,
                        'name' => $attendeeData['name'],
                        'email' => $attendeeData['email'],
                        'phone' => $attendeeData['phone'] ?? null,
                        'ticket_code' => strtoupper(Str::random(12)),
                        'custom_data' => $attendeeData['custom_data'] ?? null,
                    ];
                }
            }

            $order = Order::create([
                'event_id' => $event->id,
                'order_number' => 'EVT-' . date('Ymd') . '-' . strtoupper(Str::random(8)),
                'customer_name' => $validated['customer_name'],
                'customer_email' => $validated['customer_email'],
                'customer_phone' => $validated['customer_phone'] ?? null,
                'total_amount' => $totalAmount,
                'status' => 'confirmed',
                'payment_method' => $totalAmount > 0 ? 'online' : 'free',
                'form_data' => $validated['form_data'] ?? null,
            ]);

            foreach ($orderItems as $item) {
                $order->items()->create($item);
            }

            foreach ($ticketsToCreate as $attendeeData) {
                $attendeeData['order_id'] = $order->id;
                Attendee::create($attendeeData);
            }

            DB::commit();

            $order->load(['items', 'attendees']);

            return response()->json([
                'message' => 'Registration successful',
                'order' => $order,
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 400);
        }
    }

    public function getOrder($orderNumber)
    {
        $order = Order::where('order_number', $orderNumber)
            ->with(['event', 'items', 'attendees'])
            ->firstOrFail();

        return response()->json($order);
    }

    public function downloadTicket($ticketCode)
    {
        $attendee = Attendee::where('ticket_code', $ticketCode)
            ->with(['order', 'order.event'])
            ->firstOrFail();

        $event = $attendee->order->event;

        $qrCode = base64_encode(QrCode::format('png')->size(200)->generate($ticketCode));

        $options = new Options();
        $options->set('isRemoteEnabled', true);

        $dompdf = new Dompdf($options);

        $html = view('ticket', [
            'attendee' => $attendee,
            'event' => $event,
            'qrCode' => $qrCode,
        ])->render();

        $dompdf->loadHtml($html);
        $dompdf->setPaper('A6', 'portrait');
        $dompdf->render();

        return $dompdf->stream("ticket-{$ticketCode}.pdf");
    }

    public function ticketByCode($ticketCode)
    {
        $attendee = Attendee::where('ticket_code', $ticketCode)
            ->with(['order', 'order.event'])
            ->firstOrFail();

        return response()->json([
            'attendee' => $attendee,
            'event' => $attendee->order->event,
            'order' => $attendee->order,
        ]);
    }
}
