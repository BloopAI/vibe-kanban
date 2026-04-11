//! Generic data channel message fragmentation following the SaltyRTC
//! chunked-dc protocol for reliable/ordered channels.
//!
//! Each chunk carries a 1-byte header:
//!
//! ```text
//!  7 6 5 4 3 2 1 0
//! +-+-+-+-+-+-+-+-+
//! |R R R R R|M M|E|
//! +-+-+-+-+-+-+-+-+
//! ```
//!
//! - Bits 7-3: Reserved (0)
//! - Bits 2-1: Mode = `0b11` (reliable/ordered)
//! - Bit 0: End-of-message (`1` = last chunk, `0` = more follow)
//!
//! Small messages that fit in a single chunk have 1 byte of overhead.
//! See <https://github.com/saltyrtc/saltyrtc-meta/blob/master/Chunking.md>

/// Maximum payload bytes per chunk. 60KB payload + 1 byte header stays
/// safely within the default SCTP max message size (65536 bytes).
const CHUNK_PAYLOAD_SIZE: usize = 60 * 1024;

/// Header byte: reliable/ordered mode, more chunks follow.
const BITFIELD_MORE: u8 = 0b0000_0110;

/// Header byte: reliable/ordered mode, end-of-message.
const BITFIELD_END: u8 = 0b0000_0111;

/// Split a serialized message into chunks that fit within the data channel
/// buffer. Each chunk is prefixed with a 1-byte SaltyRTC header.
pub fn fragment(data: Vec<u8>) -> Vec<Vec<u8>> {
    if data.len() <= CHUNK_PAYLOAD_SIZE {
        let mut chunk = Vec::with_capacity(1 + data.len());
        chunk.push(BITFIELD_END);
        chunk.extend_from_slice(&data);
        return vec![chunk];
    }

    let pieces: Vec<&[u8]> = data.chunks(CHUNK_PAYLOAD_SIZE).collect();
    let last_idx = pieces.len() - 1;

    pieces
        .into_iter()
        .enumerate()
        .map(|(i, payload)| {
            let header = if i == last_idx {
                BITFIELD_END
            } else {
                BITFIELD_MORE
            };
            let mut chunk = Vec::with_capacity(1 + payload.len());
            chunk.push(header);
            chunk.extend_from_slice(payload);
            chunk
        })
        .collect()
}

/// Reassembles fragmented messages from the data channel.
///
/// Relies on ordered delivery: chunks arrive sequentially, so no message ID
/// or chunk index is needed.
#[derive(Default)]
pub struct Defragmenter {
    buffer: Vec<u8>,
}

impl Defragmenter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process an incoming chunk from the data channel.
    ///
    /// Returns `Some(complete_message)` when the end-of-message flag is set,
    /// or `None` if more chunks are expected.
    pub fn process(&mut self, data: &[u8]) -> Option<Vec<u8>> {
        if data.is_empty() {
            return None;
        }

        let header = data[0];
        let payload = &data[1..];
        let is_end = header & 0x01 != 0;

        if self.buffer.is_empty() && is_end {
            // Single-chunk message: return payload directly without copying
            // through the buffer.
            return Some(payload.to_vec());
        }

        self.buffer.extend_from_slice(payload);

        if is_end {
            Some(std::mem::take(&mut self.buffer))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_message_single_chunk() {
        let data = b"hello world".to_vec();
        let chunks = fragment(data.clone());
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0][0], BITFIELD_END);
        assert_eq!(&chunks[0][1..], &data);
    }

    #[test]
    fn large_message_multiple_chunks() {
        let data = vec![0xAB; CHUNK_PAYLOAD_SIZE * 3 + 100];
        let chunks = fragment(data.clone());
        assert_eq!(chunks.len(), 4);

        // First 3 chunks: continuation
        for chunk in &chunks[..3] {
            assert_eq!(chunk[0], BITFIELD_MORE);
            assert_eq!(chunk.len(), 1 + CHUNK_PAYLOAD_SIZE);
        }
        // Last chunk: end-of-message
        assert_eq!(chunks[3][0], BITFIELD_END);
        assert_eq!(chunks[3].len(), 1 + 100);
    }

    #[test]
    fn all_chunks_fit_in_buffer() {
        let data = vec![0xAB; 500_000];
        let chunks = fragment(data);
        for chunk in &chunks {
            assert!(
                chunk.len() <= 128 * 1024,
                "chunk {} bytes exceeds 128KB",
                chunk.len()
            );
        }
    }

    #[test]
    fn fragment_defragment_roundtrip() {
        let original = vec![0xCD; CHUNK_PAYLOAD_SIZE * 2 + 500];
        let chunks = fragment(original.clone());
        assert!(chunks.len() > 1);

        let mut defrag = Defragmenter::new();
        for (i, chunk) in chunks.iter().enumerate() {
            let result = defrag.process(chunk);
            if i < chunks.len() - 1 {
                assert!(result.is_none(), "expected None for chunk {i}");
            } else {
                let reassembled = result.expect("expected Some for last chunk");
                assert_eq!(reassembled, original);
            }
        }
    }

    #[test]
    fn single_chunk_roundtrip() {
        let original = b"small message".to_vec();
        let chunks = fragment(original.clone());
        assert_eq!(chunks.len(), 1);

        let mut defrag = Defragmenter::new();
        let result = defrag.process(&chunks[0]).expect("should complete");
        assert_eq!(result, original);
    }

    #[test]
    fn two_messages_in_sequence() {
        let msg1 = vec![0x11; CHUNK_PAYLOAD_SIZE * 2];
        let msg2 = vec![0x22; CHUNK_PAYLOAD_SIZE + 50];

        let chunks1 = fragment(msg1.clone());
        let chunks2 = fragment(msg2.clone());

        let mut defrag = Defragmenter::new();

        // Process first message.
        for chunk in &chunks1[..chunks1.len() - 1] {
            assert!(defrag.process(chunk).is_none());
        }
        let r1 = defrag
            .process(chunks1.last().unwrap())
            .expect("msg1 complete");
        assert_eq!(r1, msg1);

        // Process second message.
        for chunk in &chunks2[..chunks2.len() - 1] {
            assert!(defrag.process(chunk).is_none());
        }
        let r2 = defrag
            .process(chunks2.last().unwrap())
            .expect("msg2 complete");
        assert_eq!(r2, msg2);
    }
}
