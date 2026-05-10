<?php

namespace App\Controller;

use App\Entity\Adapter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/adapters')]
class AdapterController extends AbstractController
{
    private EntityManagerInterface $entityManager;

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    #[Route('', name: 'adapter_index', methods: ['GET'])]
    public function index(): JsonResponse
    {
        $adapters = $this->entityManager->getRepository(Adapter::class)->findAll();
        $data = [];
        
        foreach ($adapters as $adapter) {
            $data[] = $this->serializeAdapter($adapter);
        }
        
        return $this->json($data);
    }

    #[Route('/{id}', name: 'adapter_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $adapter = $this->entityManager->getRepository(Adapter::class)->find($id);
        
        if (!$adapter) {
            return $this->json(['error' => 'Adapter not found'], Response::HTTP_NOT_FOUND);
        }
        
        return $this->json($this->serializeAdapter($adapter));
    }

    #[Route('/compatible', name: 'adapter_compatible', methods: ['GET'])]
    public function findCompatible(Request $request): JsonResponse
    {
        $fromMount = $request->query->get('fromMount');
        $toMount = $request->query->get('toMount');
        
        $repository = $this->entityManager->getRepository(Adapter::class);
        $queryBuilder = $repository->createQueryBuilder('a');
        
        if ($fromMount) {
            $queryBuilder->andWhere('a.fromMount = :fromMount')->setParameter('fromMount', $fromMount);
        }
        if ($toMount) {
            $queryBuilder->andWhere('a.toMount = :toMount')->setParameter('toMount', $toMount);
        }
        
        $adapters = $queryBuilder->getQuery()->getResult();
        $data = [];
        
        foreach ($adapters as $adapter) {
            $data[] = $this->serializeAdapter($adapter);
        }
        
        return $this->json($data);
    }

    #[Route('', name: 'adapter_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        
        $adapter = new Adapter();
        $adapter->setBrand($data['brand'] ?? '');
        $adapter->setModel($data['model'] ?? '');
        $adapter->setFromMount($data['fromMount'] ?? '');
        $adapter->setToMount($data['toMount'] ?? '');
        $adapter->setDescription($data['description'] ?? null);
        $adapter->setHasAutoFocus($data['hasAutoFocus'] ?? false);
        $adapter->setHasInfinityFocus($data['hasInfinityFocus'] ?? false);
        $adapter->setPurchasePrice($data['purchasePrice'] ?? null);
        $adapter->setPurchaseDate(new \DateTime($data['purchaseDate'] ?? 'now'));
        $adapter->setQuantity($data['quantity'] ?? 1);
        $adapter->setCondition($data['condition'] ?? null);
        
        $this->entityManager->persist($adapter);
        $this->entityManager->flush();
        
        return $this->json($this->serializeAdapter($adapter), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'adapter_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $adapter = $this->entityManager->getRepository(Adapter::class)->find($id);
        
        if (!$adapter) {
            return $this->json(['error' => 'Adapter not found'], Response::HTTP_NOT_FOUND);
        }
        
        $data = json_decode($request->getContent(), true);
        
        if (isset($data['brand'])) $adapter->setBrand($data['brand']);
        if (isset($data['model'])) $adapter->setModel($data['model']);
        if (isset($data['fromMount'])) $adapter->setFromMount($data['fromMount']);
        if (isset($data['toMount'])) $adapter->setToMount($data['toMount']);
        if (isset($data['description'])) $adapter->setDescription($data['description']);
        if (isset($data['hasAutoFocus'])) $adapter->setHasAutoFocus($data['hasAutoFocus']);
        if (isset($data['hasInfinityFocus'])) $adapter->setHasInfinityFocus($data['hasInfinityFocus']);
        if (isset($data['purchasePrice'])) $adapter->setPurchasePrice($data['purchasePrice']);
        if (isset($data['purchaseDate'])) $adapter->setPurchaseDate(new \DateTime($data['purchaseDate']));
        if (isset($data['quantity'])) $adapter->setQuantity($data['quantity']);
        if (isset($data['condition'])) $adapter->setCondition($data['condition']);
        
        $adapter->setUpdatedAt(new \DateTime());
        $this->entityManager->flush();
        
        return $this->json($this->serializeAdapter($adapter));
    }

    #[Route('/{id}', name: 'adapter_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $adapter = $this->entityManager->getRepository(Adapter::class)->find($id);
        
        if (!$adapter) {
            return $this->json(['error' => 'Adapter not found'], Response::HTTP_NOT_FOUND);
        }
        
        $this->entityManager->remove($adapter);
        $this->entityManager->flush();
        
        return $this->json(['message' => 'Adapter deleted successfully']);
    }

    private function serializeAdapter(Adapter $adapter): array
    {
        return [
            'id' => $adapter->getId(),
            'brand' => $adapter->getBrand(),
            'model' => $adapter->getModel(),
            'fromMount' => $adapter->getFromMount(),
            'toMount' => $adapter->getToMount(),
            'description' => $adapter->getDescription(),
            'hasAutoFocus' => $adapter->isHasAutoFocus(),
            'hasInfinityFocus' => $adapter->isHasInfinityFocus(),
            'purchasePrice' => $adapter->getPurchasePrice(),
            'purchaseDate' => $adapter->getPurchaseDate() ? $adapter->getPurchaseDate()->format('Y-m-d') : null,
            'quantity' => $adapter->getQuantity(),
            'condition' => $adapter->getCondition(),
            'createdAt' => $adapter->getCreatedAt() ? $adapter->getCreatedAt()->format('Y-m-d H:i:s') : null,
            'updatedAt' => $adapter->getUpdatedAt() ? $adapter->getUpdatedAt()->format('Y-m-d H:i:s') : null,
        ];
    }
}
