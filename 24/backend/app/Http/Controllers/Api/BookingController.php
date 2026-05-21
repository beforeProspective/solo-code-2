<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $bookings = Booking::with(['hotel', 'room'])
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json($bookings);
    }

    public function store(Request $request)
    {
        $request->validate([
            'hotel_id' => 'required|exists:hotels,id',
            'room_id' => 'required|exists:rooms,id',
            'check_in' => 'required|date|after:today',
            'check_out' => 'required|date|after:check_in',
            'guests' => 'required|integer|min:1|max:10',
        ]);

        $room = Room::where('id', $request->room_id)
            ->where('hotel_id', $request->hotel_id)
            ->firstOrFail();

        $checkIn = new \DateTime($request->check_in);
        $checkOut = new \DateTime($request->check_out);
        $nights = $checkOut->diff($checkIn)->days;
        $totalPrice = $room->price * $nights;

        $conflictingBooking = Booking::where('room_id', $request->room_id)
            ->where(function($query) use ($request) {
                $query->whereBetween('check_in', [$request->check_in, $request->check_out])
                      ->orWhereBetween('check_out', [$request->check_in, $request->check_out])
                      ->orWhere(function($q) use ($request) {
                          $q->where('check_in', '<=', $request->check_in)
                            ->where('check_out', '>=', $request->check_out);
                      });
            })
            ->where('status', 'confirmed')
            ->exists();

        if ($conflictingBooking) {
            return response()->json([
                'message' => '该房型在所选日期已被预订，请选择其他日期或房型。'
            ], 422);
        }

        $booking = DB::transaction(function () use ($request, $totalPrice, $room) {
            return Booking::create([
                'user_id' => $request->user()->id,
                'hotel_id' => $request->hotel_id,
                'room_id' => $request->room_id,
                'check_in' => $request->check_in,
                'check_out' => $request->check_out,
                'guests' => $request->guests,
                'total_price' => $totalPrice,
                'status' => 'confirmed',
            ]);
        });

        $booking->load(['hotel', 'room']);

        return response()->json([
            'message' => '预订成功！',
            'booking' => $booking,
        ], 201);
    }

    public function show(Request $request, $id)
    {
        $booking = Booking::with(['hotel', 'room'])
            ->where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json($booking);
    }

    public function cancel(Request $request, $id)
    {
        $booking = Booking::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $booking->update(['status' => 'cancelled']);

        return response()->json([
            'message' => '预订已取消',
            'booking' => $booking,
        ]);
    }
}
