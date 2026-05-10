<?php

namespace App\Controller;

use App\Entity\MaintenanceRecord;
use App\Entity\Lens;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/maintenance-records')]
class MaintenanceRecordController extends AbstractController
{
    private EntityManagerInterface $entityManager;

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    #[Route('', name: 'maintenance_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $lensId = $request->query->get('lensId');
        $repository = $this->entityManager->getRepository(MaintenanceRecord::class);
        
        if ($lensId) {
            $records = $repository->findBy(['lens' => $lensId], ['checkDate' => 'DESC']);
        } else {
            $records = $repository->findBy([], ['checkDate' => 'DESC']);
        }
        
        $data = [];
        foreach ($records as $record) {
            $data[] = $this->serializeMaintenanceRecord($record);
        }
        
        return $this->json($data);
    }

    #[Route('/overdue', name: 'maintenance_overdue', methods: ['GET'])]
    public function getOverdue(): JsonResponse
    {
        $now = new \DateTime();
        $repository = $this->entityManager->getRepository(MaintenanceRecord::class);
        
        $queryBuilder = $repository->createQueryBuilder('mr')
            ->where('mr.nextCheckDate IS NOT NULL')
            ->andWhere('mr.nextCheckDate <= :now')
            ->setParameter('now', $now)
            ->orderBy('mr.nextCheckDate', 'ASC');
        
        $records = $queryBuilder->getQuery()->getResult();
        
        $data = [];
        foreach ($records as $record) {
            $data[] = $this->serializeMaintenanceRecord($record);
        }
        
        return $this->json($data);
    }

    #[Route('/reminders', name: 'maintenance_reminders', methods: ['GET'])]
    public function getReminders(Request $request): JsonResponse
    {
        $days = $request->query->get('days', 30);
        $fromDate = new \DateTime();
        $toDate = (new \DateTime())->modify('+' . $days . ' days');
        
        $repository = $this->entityManager->getRepository(MaintenanceRecord::class);
        
        $queryBuilder = $repository->createQueryBuilder('mr')
            ->where('mr.nextCheckDate IS NOT NULL')
            ->andWhere('mr.nextCheckDate >= :from')
            ->andWhere('mr.nextCheckDate <= :to')
            ->setParameter('from', $fromDate)
            ->setParameter('to', $toDate)
            ->orderBy('mr.nextCheckDate', 'ASC');
        
        $records = $queryBuilder->getQuery()->getResult();
        
        $data = [];
        foreach ($records as $record) {
            $data[] = $this->serializeMaintenanceRecord($record);
        }
        
        return $this->json($data);
    }

    #[Route('/{id}', name: 'maintenance_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $record = $this->entityManager->getRepository(MaintenanceRecord::class)->find($id);
        
        if (!$record) {
            return $this->json(['error' => 'Maintenance record not found'], Response::HTTP_NOT_FOUND);
        }
        
        return $this->json($this->serializeMaintenanceRecord($record));
    }

    #[Route('', name: 'maintenance_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        
        $lens = $this->entityManager->getRepository(Lens::class)->find($data['lensId'] ?? null);
        
        if (!$lens) {
            return $this->json(['error' => 'Lens not found'], Response::HTTP_NOT_FOUND);
        }
        
        $record = new MaintenanceRecord();
        $record->setLens($lens);
        $record->setCheckDate(new \DateTime($data['checkDate'] ?? 'now'));
        $record->setCheckType($data['checkType'] ?? '');
        $record->setHasMold($data['hasMold'] ?? false);
        $record->setMoldLocation($data['moldLocation'] ?? null);
        $record->setMoldSeverity($data['moldSeverity'] ?? null);
        $record->setNotes($data['notes'] ?? null);
        $record->setActionsTaken($data['actionsTaken'] ?? null);
        $record->setNextCheckDate(isset($data['nextCheckDate']) ? new \DateTime($data['nextCheckDate']) : null);
        
        $this->entityManager->persist($record);
        $this->entityManager->flush();
        
        return $this->json($this->serializeMaintenanceRecord($record), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'maintenance_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $record = $this->entityManager->getRepository(MaintenanceRecord::class)->find($id);
        
        if (!$record) {
            return $this->json(['error' => 'Maintenance record not found'], Response::HTTP_NOT_FOUND);
        }
        
        $data = json_decode($request->getContent(), true);
        
        if (isset($data['lensId'])) {
            $lens = $this->entityManager->getRepository(Lens::class)->find($data['lensId']);
            if ($lens) {
                $record->setLens($lens);
            }
        }
        if (isset($data['checkDate'])) $record->setCheckDate(new \DateTime($data['checkDate']));
        if (isset($data['checkType'])) $record->setCheckType($data['checkType']);
        if (isset($data['hasMold'])) $record->setHasMold($data['hasMold']);
        if (isset($data['moldLocation'])) $record->setMoldLocation($data['moldLocation']);
        if (isset($data['moldSeverity'])) $record->setMoldSeverity($data['moldSeverity']);
        if (isset($data['notes'])) $record->setNotes($data['notes']);
        if (isset($data['actionsTaken'])) $record->setActionsTaken($data['actionsTaken']);
        if (isset($data['nextCheckDate'])) {
            $record->setNextCheckDate($data['nextCheckDate'] ? new \DateTime($data['nextCheckDate']) : null);
        }
        
        $record->setUpdatedAt(new \DateTime());
        $this->entityManager->flush();
        
        return $this->json($this->serializeMaintenanceRecord($record));
    }

    #[Route('/{id}', name: 'maintenance_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $record = $this->entityManager->getRepository(MaintenanceRecord::class)->find($id);
        
        if (!$record) {
            return $this->json(['error' => 'Maintenance record not found'], Response::HTTP_NOT_FOUND);
        }
        
        $this->entityManager->remove($record);
        $this->entityManager->flush();
        
        return $this->json(['message' => 'Maintenance record deleted successfully']);
    }

    private function serializeMaintenanceRecord(MaintenanceRecord $record): array
    {
        $lens = $record->getLens();
        return [
            'id' => $record->getId(),
            'lensId' => $lens ? $lens->getId() : null,
            'lensName' => $lens ? $lens->getBrand() . ' ' . $lens->getModel() : null,
            'checkDate' => $record->getCheckDate() ? $record->getCheckDate()->format('Y-m-d') : null,
            'checkType' => $record->getCheckType(),
            'hasMold' => $record->isHasMold(),
            'moldLocation' => $record->getMoldLocation(),
            'moldSeverity' => $record->getMoldSeverity(),
            'notes' => $record->getNotes(),
            'actionsTaken' => $record->getActionsTaken(),
            'nextCheckDate' => $record->getNextCheckDate() ? $record->getNextCheckDate()->format('Y-m-d') : null,
            'createdAt' => $record->getCreatedAt() ? $record->getCreatedAt()->format('Y-m-d H:i:s') : null,
            'updatedAt' => $record->getUpdatedAt() ? $record->getUpdatedAt()->format('Y-m-d H:i:s') : null,
        ];
    }
}
