<?php

namespace App\Controller;

use App\Entity\Lens;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/lenses')]
class LensController extends AbstractController
{
    private EntityManagerInterface $entityManager;

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    #[Route('', name: 'lens_index', methods: ['GET'])]
    public function index(): JsonResponse
    {
        $lenses = $this->entityManager->getRepository(Lens::class)->findAll();
        $data = [];
        
        foreach ($lenses as $lens) {
            $data[] = $this->serializeLens($lens);
        }
        
        return $this->json($data);
    }

    #[Route('/{id}', name: 'lens_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $lens = $this->entityManager->getRepository(Lens::class)->find($id);
        
        if (!$lens) {
            return $this->json(['error' => 'Lens not found'], Response::HTTP_NOT_FOUND);
        }
        
        return $this->json($this->serializeLens($lens));
    }

    #[Route('', name: 'lens_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        
        $lens = new Lens();
        $lens->setBrand($data['brand'] ?? '');
        $lens->setModel($data['model'] ?? '');
        $lens->setMountType($data['mountType'] ?? '');
        $lens->setFocalLength($data['focalLength'] ?? 0);
        $lens->setMaxAperture($data['maxAperture'] ?? null);
        $lens->setMinAperture($data['minAperture'] ?? null);
        $lens->setProductionYear($data['productionYear'] ?? null);
        $lens->setDescription($data['description'] ?? null);
        $lens->setCondition($data['condition'] ?? null);
        $lens->setPurchasePrice($data['purchasePrice'] ?? null);
        $lens->setPurchaseDate(new \DateTime($data['purchaseDate'] ?? 'now'));
        $lens->setSerialNumber($data['serialNumber'] ?? null);
        $lens->setHasAutoFocus($data['hasAutoFocus'] ?? false);
        
        $this->entityManager->persist($lens);
        $this->entityManager->flush();
        
        return $this->json($this->serializeLens($lens), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'lens_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $lens = $this->entityManager->getRepository(Lens::class)->find($id);
        
        if (!$lens) {
            return $this->json(['error' => 'Lens not found'], Response::HTTP_NOT_FOUND);
        }
        
        $data = json_decode($request->getContent(), true);
        
        if (isset($data['brand'])) $lens->setBrand($data['brand']);
        if (isset($data['model'])) $lens->setModel($data['model']);
        if (isset($data['mountType'])) $lens->setMountType($data['mountType']);
        if (isset($data['focalLength'])) $lens->setFocalLength($data['focalLength']);
        if (isset($data['maxAperture'])) $lens->setMaxAperture($data['maxAperture']);
        if (isset($data['minAperture'])) $lens->setMinAperture($data['minAperture']);
        if (isset($data['productionYear'])) $lens->setProductionYear($data['productionYear']);
        if (isset($data['description'])) $lens->setDescription($data['description']);
        if (isset($data['condition'])) $lens->setCondition($data['condition']);
        if (isset($data['purchasePrice'])) $lens->setPurchasePrice($data['purchasePrice']);
        if (isset($data['purchaseDate'])) $lens->setPurchaseDate(new \DateTime($data['purchaseDate']));
        if (isset($data['serialNumber'])) $lens->setSerialNumber($data['serialNumber']);
        if (isset($data['hasAutoFocus'])) $lens->setHasAutoFocus($data['hasAutoFocus']);
        
        $lens->setUpdatedAt(new \DateTime());
        $this->entityManager->flush();
        
        return $this->json($this->serializeLens($lens));
    }

    #[Route('/{id}', name: 'lens_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $lens = $this->entityManager->getRepository(Lens::class)->find($id);
        
        if (!$lens) {
            return $this->json(['error' => 'Lens not found'], Response::HTTP_NOT_FOUND);
        }
        
        $this->entityManager->remove($lens);
        $this->entityManager->flush();
        
        return $this->json(['message' => 'Lens deleted successfully']);
    }

    private function serializeLens(Lens $lens): array
    {
        return [
            'id' => $lens->getId(),
            'brand' => $lens->getBrand(),
            'model' => $lens->getModel(),
            'mountType' => $lens->getMountType(),
            'focalLength' => $lens->getFocalLength(),
            'maxAperture' => $lens->getMaxAperture(),
            'minAperture' => $lens->getMinAperture(),
            'productionYear' => $lens->getProductionYear(),
            'description' => $lens->getDescription(),
            'condition' => $lens->getCondition(),
            'purchasePrice' => $lens->getPurchasePrice(),
            'purchaseDate' => $lens->getPurchaseDate() ? $lens->getPurchaseDate()->format('Y-m-d') : null,
            'serialNumber' => $lens->getSerialNumber(),
            'hasAutoFocus' => $lens->isHasAutoFocus(),
            'createdAt' => $lens->getCreatedAt() ? $lens->getCreatedAt()->format('Y-m-d H:i:s') : null,
            'updatedAt' => $lens->getUpdatedAt() ? $lens->getUpdatedAt()->format('Y-m-d H:i:s') : null,
        ];
    }
}
