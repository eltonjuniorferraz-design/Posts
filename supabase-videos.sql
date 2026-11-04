-- Habilita vídeos nas postagens públicas dos murais.
-- Limite de 25 MB por arquivo; a aplicação mantém o limite de 3 MB para imagens.
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]::text[]
where id = 'post-images';
