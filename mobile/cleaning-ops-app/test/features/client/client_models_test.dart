import 'package:cleaning_ops_app/features/client/data/client_models.dart';
import 'package:cleaning_ops_app/features/client/presentation/client_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:flutter_test/flutter_test.dart';

/// Разбор ответов core/ticket-service для портала и чистые функции главной
/// (сортировка, ближайшие смены, последняя уборка) — зеркало `queries.ts`.
void main() {
  group('ClientObject', () {
    test('разбирает страницу `{items,total}` и объект', () {
      final List<ClientObject> list = ClientObject.listFrom(<String, dynamic>{
        'items': <dynamic>[
          <String, dynamic>{
            'id': 'o1',
            'name': 'БЦ «Ромашка»',
            'address': 'Москва',
            'type': 'Бизнес-центр',
            'totalArea': 1500.5,
            'floorsCount': 3,
            'status': 'PAUSED',
          },
          <String, dynamic>{'name': 'без id'},
        ],
        'total': 1,
      });
      expect(list, hasLength(1));
      expect(list.single.name, 'БЦ «Ромашка»');
      expect(list.single.isPaused, isTrue);
      expect(list.single.totalArea, 1500.5);
      expect(ClientFormat.area(1500.5), '1500.5');
      expect(ClientFormat.area(850), '850');
    });

    test('деталь объекта считает помещения по этажам', () {
      final ClientObjectDetail? detail = ClientObjectDetail.tryParse(<String, dynamic>{
        'floors': <dynamic>[
          <String, dynamic>{
            'id': 'f1',
            'name': '1 этаж',
            'number': 1,
            'rooms': <dynamic>[
              <String, dynamic>{'id': 'r1', 'name': 'Холл'},
              <String, dynamic>{'id': 'r2', 'name': 'Санузел'},
            ],
          },
          <String, dynamic>{'id': 'f2', 'name': '2 этаж', 'number': 2, 'rooms': <dynamic>[]},
        ],
      });
      expect(detail!.roomsCount, 2);
      expect(detail.floors.first.rooms.last.name, 'Санузел');
    });
  });

  group('ClientTicket', () {
    test('разбирает список со счётчиками и деталь с комментариями', () {
      final ClientTicketPage page = ClientTicketPage.parse(<String, dynamic>{
        'items': <dynamic>[
          <String, dynamic>{
            'id': '0123456789abcdef',
            'type': 'unscheduled',
            'priority': 'high',
            'status': 'overdue',
            'description': 'Протекает кран',
            'createdAt': '2026-10-01T10:00:00.000Z',
            'updatedAt': '2026-10-02T10:00:00.000Z',
            'overdueAt': '2026-10-02T09:00:00.000Z',
            'assigneeId': 'u2',
            '_count': <String, dynamic>{'comments': 2, 'assignments': 1, 'operations': 0},
          },
        ],
        'total': 7,
      });
      expect(page.total, 7);
      final ClientTicket t = page.items.single;
      expect(t.shortId, '01234567');
      expect(t.isOverdue, isTrue);
      expect(t.commentsCount, 2);
      expect(TicketStatuses.label(t.status), 'Просрочена');
      expect(TicketStatuses.isDone('closed'), isTrue);
      expect(TicketStatuses.isDone('paused'), isFalse);

      final ClientTicketDetail? detail = ClientTicketDetail.tryParse(<String, dynamic>{
        'id': 't1',
        'status': 'completed',
        'description': 'Готово',
        'createdAt': '2026-10-01T10:00:00.000Z',
        'completedAt': '2026-10-01T12:00:00.000Z',
        'operationsTotal': 4,
        'operationsCompleted': 4,
        'comments': <dynamic>[
          <String, dynamic>{
            'id': 'c1',
            'authorId': 'me',
            'text': 'Спасибо',
            'createdAt': '2026-10-01T13:00:00.000Z'
          },
        ],
        'operations': <dynamic>[1, 2, 3, 4],
      });
      expect(detail!.operationsCompleted, 4);
      expect(detail.comments.single.text, 'Спасибо');
      expect(detail.ticket.doneAt, '2026-10-01T12:00:00.000Z');
    });
  });

  group('главная: чистые функции', () {
    final DateTime now = DateTime.utc(2026, 10, 8, 12);

    ScheduleEvent event(String id, String status, String start, {String? checkOut}) {
      return ScheduleEvent.tryParse(<String, dynamic>{
        'id': id,
        'scheduleName': 'Дневная',
        'date': start.substring(0, 10),
        'plannedStart': start,
        'status': status,
        if (checkOut != null) 'checkOutAt': checkOut,
      })!;
    }

    test('ближайшие смены — только будущие PLANNED/CHECKED_IN по возрастанию', () {
      final List<ScheduleEvent> events = <ScheduleEvent>[
        event('past', 'PLANNED', '2026-10-08T08:00:00.000Z'),
        event('later', 'PLANNED', '2026-10-10T08:00:00.000Z'),
        event('soon', 'CHECKED_IN', '2026-10-08T14:00:00.000Z'),
        event('missed', 'MISSED', '2026-10-09T08:00:00.000Z'),
        event('done', 'CHECKED_OUT', '2026-10-07T08:00:00.000Z', checkOut: '2026-10-07T16:00:00.000Z'),
        event('done-old', 'CHECKED_OUT', '2026-10-01T08:00:00.000Z', checkOut: '2026-10-01T16:00:00.000Z'),
      ];
      expect(upcomingShifts(events, now).map((ScheduleEvent e) => e.id), <String>['soon', 'later']);
      expect(lastCompletedShift(events)!.id, 'done');
      expect(lastCompletedShift(const <ScheduleEvent>[]), isNull);
    });

    test('заявки сортируются свежими сверху', () {
      ClientTicket t(String id, String created) => ClientTicket(
            id: id,
            type: 'planned',
            priority: 'normal',
            status: 'new',
            description: '',
            createdAt: created,
            updatedAt: created,
          );
      final List<ClientTicket> sorted = sortTicketsByDate(<ClientTicket>[
        t('a', '2026-10-01T00:00:00Z'),
        t('c', '2026-10-03T00:00:00Z'),
        t('b', '2026-10-02T00:00:00Z'),
      ]);
      expect(sorted.map((ClientTicket x) => x.id), <String>['c', 'b', 'a']);
    });
  });
}
