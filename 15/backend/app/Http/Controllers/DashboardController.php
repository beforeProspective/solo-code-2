<?php

namespace App\Http\Controllers;

use App\Models\Incident;
use App\Models\ServiceComponent;
use App\Models\Subscriber;
use App\Models\Metric;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function stats()
    {
        $totalComponents = ServiceComponent::count();
        $operationalComponents = ServiceComponent::where('status', 'operational')->count();
        $degradedComponents = ServiceComponent::where('status', 'degraded')->count();
        $outageComponents = ServiceComponent::whereIn('status', ['partial_outage', 'major_outage'])->count();

        $openIncidents = Incident::whereIn('status', ['investigating', 'identified', 'monitoring'])
            ->where('is_maintenance', false)
            ->count();
        
        $maintenances = Incident::where('is_maintenance', true)
            ->whereIn('status', ['investigating', 'identified', 'monitoring'])
            ->count();

        $resolvedIncidents = Incident::where('status', 'resolved')
            ->where('is_maintenance', false)
            ->count();

        $subscribers = Subscriber::count();
        $metrics = Metric::count();

        $recentIncidents = Incident::with(['updates', 'components.component'])
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        $overallStatus = $this->getOverallStatus();

        return response()->json([
            'components' => [
                'total' => $totalComponents,
                'operational' => $operationalComponents,
                'degraded' => $degradedComponents,
                'outage' => $outageComponents,
            ],
            'incidents' => [
                'open' => $openIncidents,
                'resolved' => $resolvedIncidents,
                'maintenances' => $maintenances,
            ],
            'subscribers' => $subscribers,
            'metrics' => $metrics,
            'overall_status' => $overallStatus,
            'recent_incidents' => $recentIncidents,
        ]);
    }

    public function publicStatus()
    {
        $components = ServiceComponent::orderBy('order', 'asc')->get();
        
        $grouped = [];
        foreach ($components as $component) {
            $group = $component->group_name ?? 'General';
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = $component;
        }

        $openIncidents = Incident::with(['updates', 'components.component'])
            ->whereIn('status', ['investigating', 'identified', 'monitoring'])
            ->where('is_maintenance', false)
            ->orderBy('created_at', 'desc')
            ->get();

        $maintenances = Incident::with(['updates', 'components.component'])
            ->where('is_maintenance', true)
            ->whereIn('status', ['investigating', 'identified', 'monitoring'])
            ->orderBy('scheduled_at', 'asc')
            ->get();

        $pastIncidents = Incident::with(['updates', 'components.component'])
            ->where('status', 'resolved')
            ->where('is_maintenance', false)
            ->orderBy('resolved_at', 'desc')
            ->limit(20)
            ->get();

        $overallStatus = $this->getOverallStatus();

        return response()->json([
            'overall_status' => $overallStatus,
            'components' => $components,
            'grouped_components' => $grouped,
            'open_incidents' => $openIncidents,
            'scheduled_maintenances' => $maintenances,
            'past_incidents' => $pastIncidents,
        ]);
    }

    private function getOverallStatus()
    {
        $components = ServiceComponent::all();
        
        if ($components->isEmpty()) {
            return 'operational';
        }

        $hasOutage = $components->contains(fn($c) => in_array($c->status, ['major_outage', 'partial_outage']));
        $hasDegraded = $components->contains(fn($c) => $c->status === 'degraded');

        if ($hasOutage) {
            return 'major_outage';
        }

        if ($hasDegraded) {
            return 'degraded';
        }

        return 'operational';
    }
}
