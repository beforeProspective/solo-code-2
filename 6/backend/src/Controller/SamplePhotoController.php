<?php

namespace App\Controller;

use App\Entity\SamplePhoto;
use App\Entity\Lens;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/sample-photos')]
class SamplePhotoController extends AbstractController
{
    private EntityManagerInterface $entityManager;

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    #[Route('', name: 'sample_photo_index', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $lensId = $request->query->get('lensId');
        $repository = $this->entityManager->getRepository(SamplePhoto::class);
        
        if ($lensId) {
            $samplePhotos = $repository->findBy(['lens' => $lensId], ['createdAt' => 'DESC']);
        } else {
            $samplePhotos = $repository->findBy([], ['createdAt' => 'DESC']);
        }
        
        $data = [];
        foreach ($samplePhotos as $photo) {
            $data[] = $this->serializeSamplePhoto($photo);
        }
        
        return $this->json($data);
    }

    #[Route('/{id}', name: 'sample_photo_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $samplePhoto = $this->entityManager->getRepository(SamplePhoto::class)->find($id);
        
        if (!$samplePhoto) {
            return $this->json(['error' => 'Sample photo not found'], Response::HTTP_NOT_FOUND);
        }
        
        return $this->json($this->serializeSamplePhoto($samplePhoto));
    }

    #[Route('', name: 'sample_photo_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        
        $lens = $this->entityManager->getRepository(Lens::class)->find($data['lensId'] ?? null);
        
        if (!$lens) {
            return $this->json(['error' => 'Lens not found'], Response::HTTP_NOT_FOUND);
        }
        
        $samplePhoto = new SamplePhoto();
        $samplePhoto->setLens($lens);
        $samplePhoto->setTitle($data['title'] ?? '');
        $samplePhoto->setDescription($data['description'] ?? null);
        $samplePhoto->setImageUrl($data['imageUrl'] ?? '');
        $samplePhoto->setApertureUsed($data['apertureUsed'] ?? null);
        $samplePhoto->setShutterSpeed($data['shutterSpeed'] ?? null);
        $samplePhoto->setIsoUsed($data['isoUsed'] ?? null);
        $samplePhoto->setCameraModel($data['cameraModel'] ?? null);
        $samplePhoto->setDateTaken(isset($data['dateTaken']) ? new \DateTime($data['dateTaken']) : null);
        $samplePhoto->setNotes($data['notes'] ?? null);
        
        $this->entityManager->persist($samplePhoto);
        $this->entityManager->flush();
        
        return $this->json($this->serializeSamplePhoto($samplePhoto), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'sample_photo_update', methods: ['PUT', 'PATCH'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $samplePhoto = $this->entityManager->getRepository(SamplePhoto::class)->find($id);
        
        if (!$samplePhoto) {
            return $this->json(['error' => 'Sample photo not found'], Response::HTTP_NOT_FOUND);
        }
        
        $data = json_decode($request->getContent(), true);
        
        if (isset($data['lensId'])) {
            $lens = $this->entityManager->getRepository(Lens::class)->find($data['lensId']);
            if ($lens) {
                $samplePhoto->setLens($lens);
            }
        }
        if (isset($data['title'])) $samplePhoto->setTitle($data['title']);
        if (isset($data['description'])) $samplePhoto->setDescription($data['description']);
        if (isset($data['imageUrl'])) $samplePhoto->setImageUrl($data['imageUrl']);
        if (isset($data['apertureUsed'])) $samplePhoto->setApertureUsed($data['apertureUsed']);
        if (isset($data['shutterSpeed'])) $samplePhoto->setShutterSpeed($data['shutterSpeed']);
        if (isset($data['isoUsed'])) $samplePhoto->setIsoUsed($data['isoUsed']);
        if (isset($data['cameraModel'])) $samplePhoto->setCameraModel($data['cameraModel']);
        if (isset($data['dateTaken'])) $samplePhoto->setDateTaken(new \DateTime($data['dateTaken']));
        if (isset($data['notes'])) $samplePhoto->setNotes($data['notes']);
        
        $samplePhoto->setUpdatedAt(new \DateTime());
        $this->entityManager->flush();
        
        return $this->json($this->serializeSamplePhoto($samplePhoto));
    }

    #[Route('/{id}', name: 'sample_photo_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $samplePhoto = $this->entityManager->getRepository(SamplePhoto::class)->find($id);
        
        if (!$samplePhoto) {
            return $this->json(['error' => 'Sample photo not found'], Response::HTTP_NOT_FOUND);
        }
        
        $this->entityManager->remove($samplePhoto);
        $this->entityManager->flush();
        
        return $this->json(['message' => 'Sample photo deleted successfully']);
    }

    private function serializeSamplePhoto(SamplePhoto $samplePhoto): array
    {
        return [
            'id' => $samplePhoto->getId(),
            'lensId' => $samplePhoto->getLens() ? $samplePhoto->getLens()->getId() : null,
            'lensName' => $samplePhoto->getLens() ? $samplePhoto->getLens()->getBrand() . ' ' . $samplePhoto->getLens()->getModel() : null,
            'title' => $samplePhoto->getTitle(),
            'description' => $samplePhoto->getDescription(),
            'imageUrl' => $samplePhoto->getImageUrl(),
            'apertureUsed' => $samplePhoto->getApertureUsed(),
            'shutterSpeed' => $samplePhoto->getShutterSpeed(),
            'isoUsed' => $samplePhoto->getIsoUsed(),
            'cameraModel' => $samplePhoto->getCameraModel(),
            'dateTaken' => $samplePhoto->getDateTaken() ? $samplePhoto->getDateTaken()->format('Y-m-d') : null,
            'notes' => $samplePhoto->getNotes(),
            'createdAt' => $samplePhoto->getCreatedAt() ? $samplePhoto->getCreatedAt()->format('Y-m-d H:i:s') : null,
            'updatedAt' => $samplePhoto->getUpdatedAt() ? $samplePhoto->getUpdatedAt()->format('Y-m-d H:i:s') : null,
        ];
    }
}
