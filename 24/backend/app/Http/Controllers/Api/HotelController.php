<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hotel;
use Illuminate\Http\Request;

class HotelController extends Controller
{
    public function index(Request $request)
    {
        $query = Hotel::with('rooms');

        if ($request->has('city') && $request->city) {
            $query->where('city', 'like', '%' . $request->city . '%');
        }

        if ($request->has('keyword') && $request->keyword) {
            $query->where(function($q) use ($request) {
                $q->where('name', 'like', '%' . $request->keyword . '%')
                  ->orWhere('description', 'like', '%' . $request->keyword . '%');
            });
        }

        if ($request->has('star_rating') && $request->star_rating) {
            $query->where('star_rating', '>=', $request->star_rating);
        }

        if ($request->has('facilities') && $request->facilities) {
            $facilities = is_array($request->facilities) ? $request->facilities : explode(',', $request->facilities);
            foreach ($facilities as $facility) {
                $query->whereJsonContains('facilities', trim($facility));
            }
        }

        $hotels = $query->paginate(10);

        return response()->json($hotels);
    }

    public function show($id)
    {
        $hotel = Hotel::with('rooms')->findOrFail($id);
        return response()->json($hotel);
    }
}
