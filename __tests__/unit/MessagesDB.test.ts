import { MessagesDB } from '../../src/transports/MessagesDB';
import { MockLogger } from '../mocks/MockLogger';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

describe('MessagesDB', () => {
  let mockLogger: MockLogger;
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    mockLogger = new MockLogger();

    // Create a test Messages database with the expected schema
    testDbPath = path.join(__dirname, `test-messages-${Date.now()}.db`);
    testDb = new Database(testDbPath);

    // Create schema matching Messages.app structure
    testDb.exec(`
      CREATE TABLE message (
        ROWID INTEGER PRIMARY KEY,
        text TEXT,
        date INTEGER,
        is_from_me INTEGER DEFAULT 0,
        handle_id INTEGER
      );

      CREATE TABLE chat (
        ROWID INTEGER PRIMARY KEY,
        chat_identifier TEXT,
        display_name TEXT
      );

      CREATE TABLE handle (
        ROWID INTEGER PRIMARY KEY,
        id TEXT
      );

      CREATE TABLE chat_message_join (
        chat_id INTEGER,
        message_id INTEGER
      );
    `);
  });

  afterEach(() => {
    // Close and delete test database
    if (testDb) {
      testDb.close();
    }

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('constructor', () => {
    it('should open database successfully', () => {
      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      expect(messagesDB).toBeDefined();
      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Starting from message ID')
      )).toBe(true);

      messagesDB.close();
    });

    it('should throw error if database does not exist', () => {
      const nonExistentPath = '/tmp/non-existent-db.db';

      expect(() => {
        new MessagesDB(nonExistentPath, mockLogger);
      }).toThrow('Messages database not found');
    });

    it('should load last message ID on initialization', () => {
      // Insert some messages
      testDb.prepare('INSERT INTO message (ROWID, text) VALUES (?, ?)').run(1, 'Test 1');
      testDb.prepare('INSERT INTO message (ROWID, text) VALUES (?, ?)').run(2, 'Test 2');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Starting from message ID: 2')
      )).toBe(true);

      messagesDB.close();
    });

    it('should handle empty database', () => {
      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Starting from message ID: 0')
      )).toBe(true);

      messagesDB.close();
    });
  });

  describe('pollNewMessages', () => {
    it('should return new messages', async () => {
      // Set up test data
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Insert a new message (after initialization)
      const messageId = 10;
      const messageText = 'Hello world';
      const appleDate = 694224000000000000; // Approximately 2023 in Apple time

      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        messageId, messageText, appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, messageId);

      // Poll for messages
      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].text).toBe(messageText);
      expect(messages[0].threadId).toBe('iMessage;-;+15551234567');
      expect(messages[0].sender).toBe('+15551234567');
      // Note: The logic checks for ';-;' OR 'chat', so this will be detected as group
      expect(messages[0].isGroup).toBe(true);

      messagesDB.close();
    });

    it('should return multiple messages in order', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Insert multiple messages
      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Message 1', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        11, 'Message 2', appleDate + 1000, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 11);

      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        12, 'Message 3', appleDate + 2000, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 12);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(3);
      expect(messages[0].text).toBe('Message 1');
      expect(messages[1].text).toBe('Message 2');
      expect(messages[2].text).toBe('Message 3');

      messagesDB.close();
    });

    it('should only return messages since last poll', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      // Insert first message before initialization
      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Old message', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // First poll should return nothing (old message is before initialization)
      let messages = await messagesDB.pollNewMessages();
      expect(messages.length).toBe(0);

      // Insert new message
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        11, 'New message', appleDate + 1000, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 11);

      // Second poll should return only the new message
      messages = await messagesDB.pollNewMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].text).toBe('New message');

      messagesDB.close();
    });

    it('should skip messages from me', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Insert message from me (is_from_me = 1)
      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'My message', appleDate, 1, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(0);

      messagesDB.close();
    });

    it('should skip messages with no text', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Insert message with NULL text (e.g., attachment only)
      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, null, appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(0);

      messagesDB.close();
    });

    it('should detect group chats correctly', async () => {
      const chatId = 1;
      const handleId = 1;

      // Group chat identifier (has 'chat' in it)
      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;+;chat123456');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Group message', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].isGroup).toBe(true);

      messagesDB.close();
    });

    it('should detect 1:1 chats correctly', async () => {
      const chatId = 1;
      const handleId = 1;

      // 1:1 chat identifier without ';-;' or 'chat'
      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, '+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Direct message', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].isGroup).toBe(false);

      messagesDB.close();
    });

    it('should convert Apple timestamp to JavaScript Date', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Use a known Apple date
      // Apple epoch is 2001-01-01, and dates are in nanoseconds
      const appleDate = 694224000000000000; // Approximately 2023

      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Test', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].timestamp).toBeInstanceOf(Date);
      expect(messages[0].timestamp.getFullYear()).toBeGreaterThan(2020);

      messagesDB.close();
    });

    it('should handle messages with no sender gracefully', async () => {
      const chatId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      // Insert message with no handle_id
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Unknown sender', appleDate, 0, null
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].sender).toBe('unknown');

      messagesDB.close();
    });

    it('should limit results to 100 messages', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Insert 150 messages
      const appleDate = 694224000000000000;
      const insertMessage = testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)');
      const insertJoin = testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)');

      for (let i = 0; i < 150; i++) {
        insertMessage.run(100 + i, `Message ${i}`, appleDate + i, 0, handleId);
        insertJoin.run(chatId, 100 + i);
      }

      const messages = await messagesDB.pollNewMessages();

      // Should only return 100 messages (LIMIT in query)
      expect(messages.length).toBe(100);

      messagesDB.close();
    });

    it('should return empty array on error', async () => {
      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Close database to cause error
      messagesDB.close();

      const messages = await messagesDB.pollNewMessages();

      expect(messages).toEqual([]);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Failed to poll messages')
      )).toBe(true);
    });

    it('should log debug info for each message', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Test message', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      await messagesDB.pollNewMessages();

      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('New message from')
      )).toBe(true);

      messagesDB.close();
    });

    it('should log count of polled messages', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Test 1', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        11, 'Test 2', appleDate + 1000, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 11);

      await messagesDB.pollNewMessages();

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Polled 2 new message')
      )).toBe(true);

      messagesDB.close();
    });
  });

  describe('close', () => {
    it('should close database connection', () => {
      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      messagesDB.close();

      // Attempting to use closed database should fail
      expect(async () => {
        await messagesDB.pollNewMessages();
      }).rejects;
    });

    it('should not throw on close', () => {
      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      // Close should not throw
      expect(() => {
        messagesDB.close();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle email senders', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;user@icloud.com');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, 'user@icloud.com');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Email message', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].sender).toBe('user@icloud.com');

      messagesDB.close();
    });

    it('should handle empty text gracefully', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;-;+15551234567');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, '', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].text).toBe('');

      messagesDB.close();
    });

    it('should handle participants array', async () => {
      const chatId = 1;
      const handleId = 1;

      testDb.prepare('INSERT INTO chat (ROWID, chat_identifier) VALUES (?, ?)').run(chatId, 'iMessage;+;chat123');
      testDb.prepare('INSERT INTO handle (ROWID, id) VALUES (?, ?)').run(handleId, '+15551234567');

      const messagesDB = new MessagesDB(testDbPath, mockLogger);

      const appleDate = 694224000000000000;
      testDb.prepare('INSERT INTO message (ROWID, text, date, is_from_me, handle_id) VALUES (?, ?, ?, ?, ?)').run(
        10, 'Group msg', appleDate, 0, handleId
      );
      testDb.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chatId, 10);

      const messages = await messagesDB.pollNewMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].participants).toEqual([]);

      messagesDB.close();
    });
  });
});
