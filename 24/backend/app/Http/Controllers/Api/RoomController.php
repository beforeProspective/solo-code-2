<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use Illuminate\Http\Request;

class RoomController extends Controller
{
    public function index(Request $request)
    {
        $query = Room::with('hotel');

        if ($request->has('hotel_id') && $request->hotel_id) {
            $query->where('hotel_id', $request->hotel_id);
        }

        if ($request->has('price_min') && $request->price_min) {
            $query->where('price', '>=', $request->price_min);
        }

        if ($request->has('price_max') && $request->price_max) {
            $query->where('price', '<=', $request->price_max);
        }

        if ($request->has('bed_count') && $request->bed_count) {
            $query->where('bed_count', '>=', $request->bed_count);
        }

        $rooms = $query->paginate(20);

        return response()->json($rooms);
    }

    public function show($id)
    {
        $room = Room::with('hotel')->findOrFail($id);
        return response()->json($room);
    }
}
